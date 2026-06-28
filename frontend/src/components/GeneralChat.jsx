import React, { useState, useRef, useEffect } from 'react';
import '../assets/general_chat.css';
import ChatInterface from './ChatInterface';
import { API_URL } from '../apiConfig';
import { trackEvent } from '../analytics';

const WELCOME_MESSAGE = {
  role: 'bot',
  text: '👋 Hello! You can ask me about terminology, style, whole document, or specific segments.',
};

const GeneralChat = ({
  documentId,
  translatedContents,
  sourceLang,
  targetLang,
  styleGuideQueryValue,
  reviewResults,
  onSegmentEdit,
  onReviewDocument,
  reviewLoading,
}) => {
  const [messages, setMessages] = useState([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState('claude');
  const [width, setWidth] = useState(470);
  const [isResizing, setIsResizing] = useState(false);

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
      setMessages(saved ? JSON.parse(saved) : [WELCOME_MESSAGE]);
    } catch {
      setMessages([WELCOME_MESSAGE]);
    }
    setMessagesLoaded(true);
  }, [documentId]);

  // ── Persist to localStorage on change ──
  useEffect(() => {
    if (!messagesLoaded || !documentId) return;
    try {
      localStorage.setItem(`torgman-chat-${documentId}`, JSON.stringify(messages));
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

  const streamResponse = async (chatHistoryToSend, userText = null) => {
    if (loading) return;
    setLoading(true);

    if (userText) {
      setMessages(prev => [...prev, { role: 'user', text: userText }]);
    }

    try {
      const response = await fetch(`${API_URL}/document/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_history: chatHistoryToSend,
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
      let fullText = '';

      const botMessageId = Date.now();
      setMessages(prev => [...prev, { role: 'bot', text: '', id: botMessageId }]);

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
            if (payload.type === 'token') {
              fullText += payload.content;
              setMessages(prev =>
                prev.map(msg => msg.id === botMessageId ? { ...msg, text: fullText } : msg)
              );
            } else if (payload.type === 'error') {
              throw new Error(payload.content);
            }
          } catch (parseError) {
            console.warn('Failed to parse SSE data:', parseError);
          }
        }
      }

      setMessages(prev =>
        prev.map(msg => msg.id === botMessageId ? { ...msg, text: fullText } : msg)
      );

      if (userText) {
        trackEvent('general_chat_message', {
          message_length: userText.length,
          response_length: fullText.length,
          document_id: documentId,
        });
      }

      // PARSE JSON FROM RESPONSE
    const jsonMatch = fullText.match(/```json\s*({.*?})\s*```/s);
    if (jsonMatch) {
      try {
        const action = JSON.parse(jsonMatch[1]);
        if (action.action === 'edit_translation') {
          const edits = Array.isArray(action.edits) ? action.edits : [action];
          
          // Track which segments were edited
          const editedSegments = [];
          
          edits.forEach(({ segment_id, new_text }) => {
            const [pageIndex, blockIndex] = segment_id.split('-').map(Number);
            if (onSegmentEdit) {
              onSegmentEdit(pageIndex, blockIndex, new_text);
              editedSegments.push(segment_id);
            }
          });
          
          // Remove JSON from displayed message
          const cleanText = fullText.replace(/```json\s*{.*?}\s*```/s, '').trim();
          
          // Build markdown links for each edited segment
          const segmentLinks = editedSegments.map((id, index) => {
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
          
          // Create the confirmation message
          const segmentList = segmentLinks.join(', ');
          const confirmationText = `\n\n✅ Updated ${edits.length} segment(s): ${segmentList}`;
          
          setMessages(prev => {
            const newMessages = [...prev];
            if (newMessages.length > 0) {
              newMessages[newMessages.length - 1].text = cleanText + confirmationText;
            }
            return newMessages;
          });
        }
      } catch (e) {
        console.warn('Failed to parse action JSON:', e);
      }
    }
   
    } catch (error) {
      console.error('General chat error:', error);
      setMessages(prev => {
        const newMessages = [...prev];
        const last = newMessages[newMessages.length - 1];
        if (last && last.role === 'bot' && last.id) {
          last.text = '⚠️ Sorry, an error occurred. Please try again.';
        }
        return newMessages;
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
    streamResponse([{ role: 'user', text: hiddenPrompt }]);
  }, [reviewResults]);

  const handleSend = (text) => {
    const userMessage = { role: 'user', text };
    streamResponse(messages.concat(userMessage), text);
  };

  const handleClear = () => {
    setMessages([WELCOME_MESSAGE]);
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