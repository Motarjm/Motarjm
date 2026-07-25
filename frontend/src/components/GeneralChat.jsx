import React, { useState, useRef, useEffect } from 'react';
import '../assets/general_chat.css';
import ChatInterface from './ChatInterface';
import { API_URL } from '../apiConfig';
import { trackEvent } from '../analytics';

const WELCOME_MESSAGE = {
  role: 'bot',
  text: '👋 Hello! \n\nYou can ask me about terminology, style, whole document, or specific segments.\n\n I can also search the web when a question needs current information.',
};

const GeneralChat = ({
  documentId,
  translatedContents,
  sourceLang,
  targetLang,
  styleGuideQueryValue,
  reviewResults,
  onSegmentEdit,
  onChatSuggestion,
  onReviewDocument,
  reviewLoading,
}) => {
  const [messages, setMessages] = useState([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState('claude');
  const [width, setWidth] = useState(470);
  const [isResizing, setIsResizing] = useState(false);

  // Full backend-facing history, including tool turns (search calls/results).
  // This is NEVER rendered — only `messages` (user/bot only) drives the UI.
  const chatHistoryRef = useRef([]);

  // Quick-action state
  const [activeQuickAction, setActiveQuickAction] = useState(null); // null | 'replace'
  const [findTerm, setFindTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');

  const messagesEndRef = useRef(null);

  // ── Load from localStorage on mount ──
  useEffect(() => {
    const key = `torgman-chat-${documentId}`;
    try {
      const saved = localStorage.getItem(key);
      const parsed = saved ? JSON.parse(saved) : null;
      setMessages(parsed?.messages || [WELCOME_MESSAGE]);
      chatHistoryRef.current = parsed?.chatHistory || [];
    } catch {
      setMessages([WELCOME_MESSAGE]);
      chatHistoryRef.current = [];
    }
    setMessagesLoaded(true);
  }, [documentId]);

  // ── Persist to localStorage on change ──
  useEffect(() => {
    if (!messagesLoaded || !documentId) return;
    try {
      localStorage.setItem(`torgman-chat-${documentId}`, JSON.stringify({
        messages,
        chatHistory: chatHistoryRef.current,
      }));
    } catch {}
  }, [messages, documentId, messagesLoaded]);

  // ── Scroll to bottom on new messages ──
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // ── Resize logic ──
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 200 && newWidth < window.innerWidth * 0.7) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => setIsResizing(false);

    if (isResizing) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const streamResponse = async (userText = null, { silent = false } = {}) => {
    if (loading) return;
    setLoading(true);

    let botMessageId = null;
    let fullText = '';
    let activeToolCall = null;      // { id, name, args } while a search is in flight
    const toolEntriesThisTurn = []; // completed {role:'tool', ...} entries, for chat_history only

    if (userText) {
      chatHistoryRef.current = [...chatHistoryRef.current, { role: 'user', text: userText }];
      if (!silent) {
        setMessages(prev => [...prev, { role: 'user', text: userText }]);
      }
    }

    try {
      const response = await fetch(`${API_URL}/document/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_history: chatHistoryRef.current,
          style_guide: styleGuideQueryValue || '',
          translated_contents: translatedContents,
          source_lang: sourceLang,
          target_lang: targetLang,
          review_results: reviewResults || null,
          model: model,
        }),
      });

      if (!response.ok) throw new Error('Chat request failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(trimmedLine.slice(6));

            if (payload.type === 'tool_start') {
              // Tracked for chat_history reconstruction AND shown as a live chip.
              activeToolCall = { id: payload.id, name: payload.tool, args: { query: payload.query } };
              const toolMsgId = `tool-${payload.id || Date.now()}`;
              activeToolCall.uiId = toolMsgId;
              setMessages(prev => [...prev, {
                role: 'tool',
                id: toolMsgId,
                tool: payload.tool,
                query: payload.query || '',
                status: 'searching',
                urls: [],
              }]);

            } else if (payload.type === 'tool_call') {
              toolEntriesThisTurn.push({
                role: 'tool',
                tool_call_id: payload.id || activeToolCall?.id,
                name: payload.tool,
                args: activeToolCall?.args || { query: payload.query },
                // Full tool output (titles, urls, and text snippets) — what the
                // model actually read. The UI only ever gets `urls` for the chip.
                content: payload.content || JSON.stringify({ query: payload.query, results: payload.urls || [] }),
              });
              const uiId = activeToolCall?.uiId;
              setMessages(prev => prev.map(msg =>
                msg.id === uiId
                  ? { ...msg, status: 'done', urls: payload.urls || [], query: payload.query || msg.query }
                  : msg
              ));
              activeToolCall = null;

            } else if (payload.type === 'token') {
              fullText += payload.content;
              if (!botMessageId) {
                botMessageId = `bot-${Date.now()}`;
                setMessages(prev => [...prev, { role: 'bot', text: fullText, id: botMessageId }]);
              } else {
                const targetId = botMessageId;
                setMessages(prev =>
                  prev.map(msg => msg.id === targetId ? { ...msg, text: fullText } : msg)
                );
              }

            } else if (payload.type === 'error') {
              throw new Error(payload.content);
            }
          } catch (parseError) {
            console.warn('Failed to parse SSE data:', parseError);
          }
        }
      }

      if (botMessageId) {
        const finalBotId = botMessageId;
        setMessages(prev =>
          prev.map(msg => msg.id === finalBotId ? { ...msg, text: fullText } : msg)
        );
      }

      // Persist this turn's tool calls + final answer into the backend history
      // (tool entries are never added to `messages`, so they never render).
      chatHistoryRef.current = [
        ...chatHistoryRef.current,
        ...toolEntriesThisTurn,
        { role: 'bot', text: fullText },
      ];

      if (userText) {
        trackEvent('general_chat_message', {
          message_length: userText.length,
          response_length: fullText.length,
          document_id: documentId,
        });
      }

      // PARSE JSON FROM RESPONSE
      const jsonMatch = fullText.match(/```json\s*({.*?})\s*```/s);
      if (jsonMatch && botMessageId) {
        try {
          const action = JSON.parse(jsonMatch[1]);
          if (action.action === 'edit_translation') {
            const edits = Array.isArray(action.edits) ? action.edits : [action];

            // Collect segment IDs for which suggestions were added
            const suggestedSegments = [];

            edits.forEach(({ segment_id, new_text }) => {
              if (onChatSuggestion) {
                onChatSuggestion(segment_id, new_text, 'Chat suggestion');
                suggestedSegments.push(segment_id);
              }
            });

            // Remove JSON from displayed message
            const cleanText = fullText.replace(/```json\s*{.*?}\s*```/s, '').trim();

            // Build markdown links for each suggested segment
            const segmentLinks = suggestedSegments.map((id) => {
              const [page, block] = id.split('-');
              // Calculate the display number (segment counter)
              let segmentNumber = 0;
              for (let p = 0; p < parseInt(page); p++) {
                if (translatedContents[p]) {
                  segmentNumber += translatedContents[p].length;
                }
              }
              segmentNumber += parseInt(block) + 1;

              return `[Segment ${segmentNumber}](#segment-${id})`;
            });

            // Create the confirmation message: suggestions added for review
            const segmentList = segmentLinks.join(', ');
            const confirmationText = `\n\n📝 Added ${edits.length} suggestion(s) for review: ${segmentList}`;

            setMessages(prev => prev.map(msg =>
              msg.id === botMessageId ? { ...msg, text: cleanText + confirmationText } : msg
            ));
          }
        } catch (e) {
          console.warn('Failed to parse action JSON:', e);
        }
      }

    } catch (error) {
      console.error('General chat error:', error);
      setMessages(prev => {
        if (botMessageId) {
          return prev.map(msg =>
            msg.id === botMessageId ? { ...msg, text: '⚠️ Sorry, an error occurred. Please try again.' } : msg
          );
        }
        return [...prev, { role: 'bot', text: '⚠️ Sorry, an error occurred. Please try again.' }];
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Auto-trigger when review completes ──
  useEffect(() => {
    if (!reviewResults || reviewResults.length === 0) return;
    const changedCount = reviewResults.filter(r => r.changed).length;
    const hiddenPrompt = `The document review just finished. ${changedCount} out of ${reviewResults.length} segments were revised. Summarize what was changed and why, referencing specific segments where useful.`;
    streamResponse(hiddenPrompt, { silent: true });
  }, [reviewResults]);

  const handleSend = (text) => {
    streamResponse(text);
  };

  const handleClear = () => {
    setMessages([WELCOME_MESSAGE]);
    chatHistoryRef.current = [];
    try { localStorage.removeItem(`torgman-chat-${documentId}`); } catch {}
  };

  const handleReplaceSubmit = () => {
    const find = findTerm.trim();
    const replace = replaceTerm.trim();
    if (!find) return;
    const prompt = replace
      ? `Change all occurrences of "${find}" to "${replace}" in the Arabic translation.`
      : `Find and list all occurrences of "${find}" in the Arabic translation.`;
    handleSend(prompt);
    setActiveQuickAction(null);
    setFindTerm('');
    setReplaceTerm('');
  };

  return (
    <div className="general-chat-panel" style={{ width: `${width}px` }}>
      <div
        className={`general-chat-resizer ${isResizing ? 'active' : ''}`}
        onMouseDown={() => setIsResizing(true)}
        title="Drag to resize"
      />

      <div className="general-chat-header">
        <span className="general-chat-title">Document Chat</span>
        <button className="general-chat-clear-btn" onClick={handleClear} title="Clear conversation">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4h6v2" />
          </svg>
        </button>
      </div>

      {/* ── Quick Actions Strip ── */}
      <div className="quick-actions-strip">
        <div className="quick-actions-chips">
          <button
            className={`quick-chip review-chip ${reviewLoading ? 'loading' : ''}`}
            onClick={() => onReviewDocument && onReviewDocument()}
            disabled={reviewLoading || loading}
            title="Run AI review across all segments"
          >
            {reviewLoading
              ? <><span className="chip-spinner" /> Reviewing…</>
              : <><span className="chip-icon">🔍</span> Review Document</>
            }
          </button>

          <button
            className={`quick-chip ${activeQuickAction === 'replace' ? 'active' : ''}`}
            onClick={() => setActiveQuickAction(activeQuickAction === 'replace' ? null : 'replace')}
            disabled={loading}
            title="Change all occurrences of a term"
          >
            <span className="chip-icon">🔄</span> Replace term
          </button>

          <button
            className="quick-chip"
            onClick={() => handleSend('Summarize the translation quality and key decisions made in this document.')}
            disabled={loading}
            title="Get a summary of what was translated"
          >
            <span className="chip-icon">📊</span> Summarize
          </button>

          <button
            className="quick-chip"
            onClick={() => handleSend('Check the document for terminology consistency — are key terms translated the same way throughout? List any inconsistencies.')}
            disabled={loading}
            title="Check term consistency across segments"
          >
            <span className="chip-icon">✅</span> Check consistency
          </button>
        </div>

        {activeQuickAction === 'replace' && (
          <div className="quick-action-form">
            <input
              className="qa-input"
              placeholder="Find…"
              value={findTerm}
              onChange={e => setFindTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleReplaceSubmit()}
              autoFocus
            />
            <span className="qa-arrow">→</span>
            <input
              className="qa-input"
              placeholder="Replace with…"
              value={replaceTerm}
              onChange={e => setReplaceTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleReplaceSubmit()}
            />
            <button
              className="qa-submit-btn"
              onClick={handleReplaceSubmit}
              disabled={!findTerm.trim() || loading}
            >
              Go
            </button>
          </div>
        )}
      </div>

      <ChatInterface
        messages={messages}
        onSend={handleSend}
        isLoading={loading}
        model={model}
        onModelChange={setModel}
        showModelSelect={true}
        placeholder="Ask about the document…"
        emptyStateText="Ask about terminology, style, or specific segments."
        messagesEndRef={messagesEndRef}
      />
    </div>
  );
};

export default GeneralChat;