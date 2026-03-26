import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { diffWords } from 'diff';
import '../assets/focus_chat.css';
import { API_URL } from '../apiConfig';

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


const FocusChatPanel = ({ segment, segmentId, pageContext, docContext, sourceLang, targetLang, onClose, onEditTranslation }) => {
  const [messages, setMessages] = useState(() => {
    // Load chat history from sessionStorage on mount
    try {
      const saved = sessionStorage.getItem(`chat_history_${segmentId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.messages || [];
      }
    } catch (e) {
      console.error('Failed to load chat history from sessionStorage:', e);
    }
    return [];
  });
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini');
  const [isStreaming, setIsStreaming] = useState(false);
  const [ephemeralError, setEphemeralError] = useState(null);
  const [pendingEdit, setPendingEdit] = useState(null);
  const messagesEndRef = useRef(null);
  const abortRef = useRef(null);
  const textareaRef = useRef(null);
  const chatHistoryRef = useRef([]); // full raw history (including JSON actions) sent to backend

  // Load chatHistoryRef from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`chat_history_${segmentId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        chatHistoryRef.current = parsed.chatHistory || [];
      }
    } catch (e) {
      console.error('Failed to load raw chat history from sessionStorage:', e);
    }
  }, [segmentId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Save chat history to sessionStorage whenever messages or chatHistoryRef changes
  useEffect(() => {
    try {
      sessionStorage.setItem(`chat_history_${segmentId}`, JSON.stringify({
        messages: messages,
        chatHistory: chatHistoryRef.current
      }));
    } catch (e) {
      console.error('Failed to save chat history to sessionStorage:', e);
    }
  }, [messages, segmentId]);

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

  // Auto-resize textarea when user types (Claude-style)
  const handleInputChange = (e) => {
    setInput(e.target.value);
    
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      // Grow up to a maximum height, then allow scrolling
      const newHeight = Math.min(scrollHeight, 300); // Max 300px before scrollbar
      textareaRef.current.style.height = newHeight + 'px';
      
      // Add scrollable class only when content exceeds max-height
      if (scrollHeight > 150) {
        textareaRef.current.classList.add('scrollable');
      } else {
        textareaRef.current.classList.remove('scrollable');
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    setEphemeralError(null);
    const userMsg = { role: 'user', text: input };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    chatHistoryRef.current = [...chatHistoryRef.current, userMsg];
    setInput('');
    
    // Reset textarea height to default
    if (textareaRef.current) {
      textareaRef.current.style.height = '38px';
      textareaRef.current.classList.remove('scrollable');
    }
    
    setIsStreaming(true);

    // Add empty bot message placeholder for streaming
    const botIndex = updatedMessages.length;
    setMessages(prev => [...prev, { role: 'bot', text: '' }]);

    try {
      abortRef.current = new AbortController();
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
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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

          <div className="focus-chat-messages">
            {messages.length === 0 && !ephemeralError && (
              <div className="focus-chat-empty">
                We Prompt Engineer. You Translate.
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`focus-chat-msg focus-chat-msg-${msg.role}`}>
                {msg.role === 'bot' ? (
                  msg.text === '' ? (
                    <span className="focus-chat-typing">
                      <span /><span /><span />
                    </span>
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                  )
                ) : (
                  msg.text
                )}
              </div>
            ))}
            {ephemeralError && (
              <div className="focus-chat-msg focus-chat-msg-error">
                {ephemeralError}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {pendingEdit && (
            <DiffPreview
              oldText={pendingEdit.oldText}
              newText={pendingEdit.newText}
              onApply={() => {
                onEditTranslation(pendingEdit.newText);
                setPendingEdit(null);
              }}
              onDiscard={() => setPendingEdit(null)}
            />
          )}

          <div className="focus-chat-input-row">
            <select
              className="focus-chat-model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              <option value="gemini">Gemini</option>
              <option value="grok">Grok</option>
              <option value="deepseek">DeepSeek</option>
            </select>
            <textarea
              ref={textareaRef}
              className="focus-chat-input"
              placeholder="Ask anything about this segment..."
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button className="focus-chat-send" onClick={handleSend} disabled={isStreaming}>
              {isStreaming ? '…' : '↑'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FocusChatPanel;