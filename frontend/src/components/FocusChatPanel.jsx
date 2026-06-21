import React, { useState, useRef, useEffect } from 'react';
import ChatInterface from './ChatInterface';
import { diffWords } from 'diff';
import '../assets/focus_chat.css';
import { API_URL } from '../apiConfig';
import { trackFocusPanelSession, trackAISuggestionApplied, trackChatInteraction, trackArabicTextCopied } from '../analytics';
import { trackApiError } from '../errorTracking';
import { loadSegmentChat, saveSegmentChat } from '../utils/indexedDbPersistence';

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
}) => {
 
  const [messages, setMessages] = useState([]);
  const [selectedModel, setSelectedModel] = useState('gemini');
  const [isStreaming, setIsStreaming] = useState(false);
  const [ephemeralError, setEphemeralError] = useState(null);
  const [pendingEdit, setPendingEdit] = useState(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const messagesEndRef = useRef(null);
  const abortRef = useRef(null);
  const chatHistoryRef = useRef([]); // full raw history (including JSON actions) sent to backend
  const focusStartTimeRef = useRef(Date.now()); // Track session start time

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

  
    const handleSend = async (text) => {
    if (!historyLoaded || !text.trim() || isStreaming) return;

    setEphemeralError(null);
    const userMsg = { role: 'user', text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    chatHistoryRef.current = [...chatHistoryRef.current, userMsg];
    trackChatInteraction('user');
    setIsStreaming(true);

    // Add empty bot message placeholder for streaming
    const botIndex = updatedMessages.length;
    setMessages(prev => [...prev, { role: 'bot', text: '' }]);

    try {
      abortRef.current = new AbortController();
      const chatEndpoint = styleGuideQueryValue
        ? `${API_URL}/segment/chat?style_guide=${styleGuideQueryValue}`
        : `${API_URL}/segment/chat`;

      const response = await fetch(chatEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          source_text: segment?.original_text,
          translation: segment?.translated_text,
          source_lang: sourceLang,
          target_lang: targetLang,
          page_context: pageContext,
          chat_history: chatHistoryRef.current, // full raw history
          model: selectedModel,
          doc_context: docContext,
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let hadError = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Parse SSE lines
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'token') {
              fullText += data.content;
              setMessages(prev => {
                const updated = [...prev];
                updated[botIndex] = { role: 'bot', text: fullText };
                return updated;
              });
            } else if (data.type === 'error') {
              // Do not append error to chat history. Show ephemeral error and remove bot placeholder.
              hadError = true;
              setEphemeralError(`⚠️ ${data.content}`);
              setMessages(prev => prev.filter((_, idx) => idx !== botIndex));
              break; // stop processing lines for this chunk
            }
          } catch { /* skip malformed lines */ }
        }
        if (hadError) break;
      }

      // If an error occurred during streaming, skip post-processing
      if (hadError) {
        // bot placeholder already removed, chatHistoryRef not updated — error is ephemeral only
      } else {
        // Check for edit action in completed response
        const action = parseAction(fullText);

        // Always append full raw text to chatHistoryRef (bot sees the JSON action)
        chatHistoryRef.current = [...chatHistoryRef.current, { role: 'bot', text: fullText }];

        // Track bot response
        trackChatInteraction('bot', selectedModel);

        if (action) {
          // Don't apply immediately — show diff for user confirmation
          setPendingEdit({ oldText: segment?.translated_text, newText: action.new_text, botIndex });
          // Display clean text (no JSON block) to the user
          const cleanText = fullText.replace(/```json\s*\{[\s\S]*?\}\s*```/, '').trim();
          setMessages(prev => {
            const updated = [...prev];
            updated[botIndex] = { role: 'bot', text: cleanText };
            return updated;
          });
        }
        // no action: messages already has the full streamed text, nothing extra to do
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        // Remove the empty bot placeholder, don't persist error in history
        setMessages(prev => prev.filter((_, idx) => idx !== botIndex));
        setEphemeralError('⚠️ Failed to get response. Please try again.');
        
        // Track chat error
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
        // Check if copied text is from AI suggestion
        const isFromSuggestion = pendingEdit && pendingEdit.newText.includes(selection);
        trackArabicTextCopied(selection.length, 'focus_chat', isFromSuggestion);
      }
    };


    // Listen for copy command
    document.addEventListener('copy', handleCopy);
    return () => document.removeEventListener('copy', handleCopy);
  }, [pendingEdit]);

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
        <div className="focus-chat">
          {/* Context note */}
          <div className="focus-chat-header">
            <p className="focus-chat-context-note">
              ℹ️ The bot has full document context — no need to provide extra background.
            </p>
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
      </div>
    </div>
  );
};

export default FocusChatPanel;