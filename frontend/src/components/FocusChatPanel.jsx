import React, { useState, useRef, useEffect } from 'react';
import ChatInterface from './ChatInterface';
import { diffWords } from 'diff';
import '../assets/focus_chat.css';
import { API_URL } from '../apiConfig';
import { trackFocusPanelSession, trackAISuggestionApplied, trackChatInteraction, trackArabicTextCopied } from '../analytics';
import { trackApiError } from '../errorTracking';
import { loadSegmentChat, saveSegmentChat } from '../utils/indexedDbPersistence';

// Strips ```json {...} ``` action blocks out of the text the user sees —
// wherever they fall in the message (start, middle, or end), including
// while the block is still streaming in and hasn't closed yet. Called on
// every token, so the raw JSON never renders even for a moment.
function stripStreamingJsonBlock(text) {
  // 1. Remove every *complete* ```json {...} ``` block, keeping any prose
  //    that comes before or after it intact (handles mid-message blocks).
  let result = text.replace(/```json\s*\{[\s\S]*?\}\s*```/g, '');
  // Collapse the gap a removed block leaves behind, without disturbing
  // normal paragraph spacing elsewhere in the message.
  result = result.replace(/\n{3,}/g, '\n\n');

  // 2. An opening ```json fence with no closing ``` yet means the JSON is
  //    still streaming in — hide from the fence to the end of the buffer
  //    (there may be nothing after it yet), but keep the prose before it.
  const openFence = result.search(/```json\b/);
  if (openFence !== -1) {
    return result.slice(0, openFence).trim();
  }

  // 3. The fence marker itself arrives one token at a time ("`", "``",
  //    "```", "```j", "```js", "```jso") right at the tail of the buffer —
  //    trim a trailing partial match so it never blinks into view for a
  //    token or two before it's recognized as the start of a fence.
  const partialFence = result.match(/`{1,3}(j(s(o(n)?)?)?)?$/);
  if (partialFence) {
    return result.slice(0, partialFence.index).trim();
  }

  return result.trim();
}

// Inline diff preview component
const DiffPreview = ({ oldText, newText, onApply, onDiscard }) => {
  const parts = diffWords(oldText, newText);
  const oldLine = parts.filter(p => !p.added);
  const newLine = parts.filter(p => !p.removed);

  return (
    <div className="diff-preview">
      <div className="diff-header">
        <span className="diff-label">Suggested edit</span>
      </div>

      <div className="diff-body">
        <div className="diff-row diff-row-old">
          <span className="diff-row-marker diff-marker-old">−</span>
          <span className="diff-text">
            {oldLine.map((part, i) => (
              <span key={i} className={part.removed ? 'diff-removed' : ''}>{part.value}</span>
            ))}
          </span>
        </div>

        <div className="diff-row diff-row-new">
          <span className="diff-row-marker diff-marker-new">+</span>
          <span className="diff-text">
            {newLine.map((part, i) => (
              <span key={i} className={part.added ? 'diff-added' : ''}>{part.value}</span>
            ))}
          </span>
        </div>
      </div>

      <div className="diff-actions">
        <button className="diff-btn diff-btn-apply" onClick={onApply}>✓ Apply</button>
        <button className="diff-btn diff-btn-discard" onClick={onDiscard}>✕ Discard</button>
      </div>
    </div>
  );
};

const getActiveProfile = () => {
  try {
    const savedProfile = sessionStorage.getItem('translation_translator_profile');
    const savedIsActive = sessionStorage.getItem('translation_translator_profile_active');
    const isActive = savedIsActive ? JSON.parse(savedIsActive) : false;
    if (!isActive || !savedProfile) return null;
    const parsed = JSON.parse(savedProfile);
    return {
      role: typeof parsed.role === 'string' ? parsed.role.trim() : '',
      preferences: Array.isArray(parsed.preferences) ? parsed.preferences : [],
    };
  } catch {
    return null;
  }
};


const FocusChatPanel = ({
  documentId,
  segment,
  segmentId,
  pageContext,
  docContext,
  sourceLang,
  targetLang,
  styleGuideQueryValue = '',
  onClose,
  onEditTranslation,
  // When true, renders just the chat column (no fullscreen overlay, no
  // topbar, no source/translation side texts) so it can be dropped inside
  // another panel — e.g. the Segment tab of the right-hand panel. All
  // streaming / persistence / diff logic below is untouched either way.
  embedded = false,
}) => {

  const [messages, setMessages] = useState([]);
  const [selectedModel, setSelectedModel] = useState('claude');
  const [isStreaming, setIsStreaming] = useState(false);
  const [ephemeralError, setEphemeralError] = useState(null);
  const [pendingEdit, setPendingEdit] = useState(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = useRef(null);
  const abortRef = useRef(null);
  const chatHistoryRef = useRef([]); // full raw history sent to backend
  const focusStartTimeRef = useRef(Date.now());

  // Load persisted chat history for this document segment.
  useEffect(() => {
    let cancelled = false;

    const hydrateHistory = async () => {
      setHistoryLoaded(false);
      try {
        const saved = await loadSegmentChat(documentId, segmentId);
        if (!cancelled) {
          setMessages(saved?.messages || []);
          chatHistoryRef.current = saved?.chatHistory || [];
        }
      } catch (e) {
        console.error('Failed to load raw chat history from IndexedDB:', e);
        if (!cancelled) {
          setMessages([]);
          chatHistoryRef.current = [];
        }
      } finally {
        if (!cancelled) {
          setHistoryLoaded(true);
        }
      }
    };

    hydrateHistory();

    return () => {
      cancelled = true;
    };
  }, [documentId, segmentId]);

  // Track focus panel session on unmount (panel closes)
  useEffect(() => {
    const startTime = focusStartTimeRef.current;
    return () => {
      const sessionDuration = Date.now() - startTime;
      trackFocusPanelSession(sessionDuration, segmentId, messages.length, !!pendingEdit);
    };
  }, [segmentId, messages.length, pendingEdit]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Persist chat history per document/segment once hydration completes.
  useEffect(() => {
    if (!historyLoaded || !documentId || !segmentId) return;

    saveSegmentChat(documentId, segmentId, {
        messages: messages,
        chatHistory: chatHistoryRef.current
      }).catch((e) => {
        console.error('Failed to save chat history to IndexedDB:', e);
      });
  }, [documentId, historyLoaded, messages, segmentId]);

  // Parse action block from completed bot message
  const parseAction = (text) => {
    const match = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (!match) return null;
    try {
      const action = JSON.parse(match[1]);
      if (action.action === 'edit_translation' && action.new_text) return action;
    } catch { /* ignore */ }
    return null;
  };


  const handleClear = () => {
    setEphemeralError(null);
    setMessages([]);
    chatHistoryRef.current = [];
    if (documentId && segmentId) {
      saveSegmentChat(documentId, segmentId, { messages: [], chatHistory: [] }).catch((e) => {
        console.error('Failed to clear chat history in IndexedDB:', e);
      });
    }
  };

    const handleSend = async (text) => {
    if (!historyLoaded || !text.trim() || isStreaming) return;

    setEphemeralError(null);
    const userMsg = { role: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    chatHistoryRef.current = [...chatHistoryRef.current, userMsg];
    trackChatInteraction('user');
    setIsStreaming(true);

    let botMessageId = null;   // only set when first token arrives
    let currentToolId = null;  // tracks the active tool chip (UI)
    let currentToolCallId = null; // backend tool_call_id for the active call
    let currentToolArgs = null;   // args of the active call, for history
    const toolEntriesThisTurn = []; // completed tool turns, for chat_history only
    let fullText = '';
    let hadError = false;

    try {
      abortRef.current = new AbortController();
      const profile = getActiveProfile();
      const response = await fetch(`${API_URL}/segment/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          source_text: segment?.original_text,
          translation: segment?.translated_text,
          source_lang: sourceLang,
          target_lang: targetLang,
          page_context: pageContext,
          chat_history: chatHistoryRef.current,
          model: selectedModel,
          doc_context: docContext,
          style_guide: styleGuideQueryValue || '',     // ← ADD
          role: profile?.role || '',                    // ← ADD
          preferences: profile?.preferences || [],      // ← ADD
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep any incomplete trailing line for the next read

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;
          let data;
          try {
            data = JSON.parse(trimmedLine.slice(6));
          } catch { /* skip malformed lines */ continue; }

          if (data.type === 'tool_start') {
            currentToolId = `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            currentToolCallId = data.id || null;
            currentToolArgs = { query: data.query || '' };
            setMessages(prev => [...prev, {
              role: 'tool',
              id: currentToolId,
              tool: data.tool,
              query: data.query || '',
              status: 'searching',
              urls: [],
            }]);

          } else if (data.type === 'tool_call') {
            setMessages(prev => prev.map(msg =>
              msg.id === currentToolId
                ? { ...msg, status: 'done', urls: data.urls || [], query: data.query || msg.query }
                : msg
            ));
            // Full tool output (not just title/url) — for chat_history/model continuity.
            toolEntriesThisTurn.push({
              role: 'tool',
              tool_call_id: data.id || currentToolCallId,
              name: data.tool,
              args: currentToolArgs || { query: data.query },
              content: data.content || JSON.stringify({ query: data.query, results: data.urls || [] }),
            });
            currentToolCallId = null;
            currentToolArgs = null;

          } else if (data.type === 'token') {
            fullText += data.content;
            const displayText = stripStreamingJsonBlock(fullText);

            if (!botMessageId) {
              botMessageId = `bot-${Date.now()}`;
              setMessages(prev => [...prev, { role: 'bot', text: displayText, id: botMessageId }]);
            } else {
              setMessages(prev =>
                prev.map(msg => msg.id === botMessageId ? { ...msg, text: displayText } : msg)
              );
            }

          } else if (data.type === 'error') {
            hadError = true;
            if (botMessageId) setMessages(prev => prev.filter(msg => msg.id !== botMessageId));
            setEphemeralError(`⚠️An Error Occured. Please try again.`);
            break;
          }
        }
        if (hadError) break;
      }

      if (!hadError) {
        // Persist this turn's tool calls + full raw bot text into chat_history
        // (this is the backend-facing history sent as chat_history on the next
        // request — separate from `messages`, which drives the visible chip).
        chatHistoryRef.current = [
          ...chatHistoryRef.current,
          ...toolEntriesThisTurn,
          { role: 'bot', text: fullText },
        ];
        trackChatInteraction('bot', selectedModel);

        const action = parseAction(fullText);
        // Raw fullText may still have the JSON block in it (parseAction and
        // chat history need it) — this is what's actually shown to the user,
        // and it's the same stripping used live, token-by-token, above.
        const displayText = stripStreamingJsonBlock(fullText);

        if (action) {
          // Show diff for user confirmation
          setPendingEdit({ oldText: segment?.translated_text, newText: action.new_text, botMessageId });
        }

        // Always reconcile the final message with the stripped text, whether
        // or not an action was found — a malformed/unrecognized JSON block
        // should never be left visible either.
        setMessages(prev => {
          const updated = [...prev];
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].role === 'bot' && updated[i].id === botMessageId) {
              updated[i] = { ...updated[i], text: displayText };
              break;
            }
          }
          return updated;
        });
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        if (botMessageId) setMessages(prev => prev.filter(msg => msg.id !== botMessageId));
        setEphemeralError('⚠️ Failed to get response. Please try again.');
        trackApiError(err, {
          endpoint: '/segment/chat',
          method: 'POST',
          action: 'Fetching chat response',
          context: {
            segment_id: segment?.id,
            source_lang: sourceLang,
            target_lang: targetLang,
            model: selectedModel,
            chat_history_length: chatHistoryRef.current?.length || 0,
          }
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };


  // Detect Arabic text and track copy events
  const detectArabicText = (text) => {
    return /[\u0600-\u06FF]/.test(text);
  };

  // Track copy events using selection API
  useEffect(() => {
    const handleCopy = () => {
      const selection = window.getSelection().toString();
      if (selection && detectArabicText(selection)) {
        const isFromSuggestion = pendingEdit && pendingEdit.newText.includes(selection);
        trackArabicTextCopied(selection.length, 'focus_chat', isFromSuggestion);
      }
    };

    document.addEventListener('copy', handleCopy);
    return () => document.removeEventListener('copy', handleCopy);
  }, [pendingEdit]);

  // The chat column itself — identical markup/logic whether embedded or in
  // the fullscreen overlay. Only the wrapper around it changes below.
  const chatColumn = (
  <div className={`focus-chat ${embedded ? 'focus-chat-embedded' : ''}`}>
    {/* Context note + clear button */}
    <div className="focus-chat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px' }}>
      <p className="focus-chat-context-note" style={{ margin: 0 }}>
        ℹ️ The bot has full document context — no need to provide extra background.
      </p>
      
      {/* ── NEW: Clear chat button (matches GeneralChat style) ── */}
      <button
        className="focus-chat-clear-btn"
        onClick={handleClear}
        title="Clear conversation"  
        onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
        onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4h6v2" />
        </svg>
      </button>
    </div>

    <ChatInterface
      messages={messages}
      onSend={handleSend}
      isLoading={isStreaming}
      model={selectedModel}
      onModelChange={setSelectedModel}
      showModelSelect={true}
      placeholder="Ask anything about this segment…"
      emptyStateText="We Prompt Engineer. You Translate."
      ephemeralError={ephemeralError}
      belowMessages={pendingEdit ? (
        <DiffPreview
          oldText={pendingEdit.oldText}
          newText={pendingEdit.newText}
          onApply={() => {
            trackAISuggestionApplied(selectedModel, pendingEdit.newText.length, true);
            onEditTranslation(pendingEdit.newText);
            setPendingEdit(null);
          }}
          onDiscard={() => setPendingEdit(null)}
        />
      ) : null}
      messagesEndRef={messagesEndRef}
    />
  </div>
);

  if (embedded) {
    // Dropped inline into a tab panel — no overlay, no topbar, no
    // source/translation side texts (those already live in the main grid).
    return <div className="focus-embedded-wrapper">{chatColumn}</div>;
  }

  return (
    <div className="focus-overlay">
      {/* Top bar */}
      <div className="focus-topbar">
        <button className="focus-back-btn" onClick={onClose}>← Back to segments</button>
        <span className="focus-segment-label">Segment {segmentId}</span>
      </div>

      <div className="focus-body">
        {/* Left: source + translation side-by-side */}
        <div className="focus-texts">
          <div className="focus-text-card">
            <span className="focus-text-label">Source</span>
            <div className="focus-text-content">{segment?.original_text}</div>
          </div>
          <div className="focus-text-card focus-text-card-rtl">
            <span className="focus-text-label">Translation</span>
            <div
              className="focus-text-content focus-text-editable"
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => onEditTranslation(e.currentTarget.textContent)}
            >
              {segment?.translated_text}
            </div>
          </div>
        </div>

        {/* Right: chat */}
        {chatColumn}
      </div>
    </div>
  );
};

export default FocusChatPanel;