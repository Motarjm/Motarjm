import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '../assets/chat_interface.css';

const ChatInterface = ({
  messages,
  onSend,
  isLoading,
  model,
  onModelChange,
  showModelSelect = false,
  placeholder = 'Type a message…',
  emptyStateText = null,
  ephemeralError = null,
  belowMessages = null,
  messagesEndRef,
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const markdownComponents = {
    a: ({ href, children, ...props }) => {
      if (href?.startsWith('#segment-')) {
        const segmentId = href.replace('#segment-', '');
        return (
          <button
            type="button"
            className="chat-segment-link"
            onClick={() => {
              const row = document.getElementById(`row-${segmentId}`);
              if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.classList.add('highlight-pulse');
                setTimeout(() => row.classList.remove('highlight-pulse'), 2000);
              }
            }}
            title={`Go to segment ${segmentId}`}
          >
            🔍 {children}
          </button>
        );
      }
      return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
    },
  };

  return (
    <>
      <div className="chat-interface-messages">
        {messages.length === 0 && !ephemeralError && emptyStateText && (
          <div className="chat-interface-empty">{emptyStateText}</div>
        )}
        {messages.map((msg, i) => (
          <div key={msg.id ?? i} className={`chat-interface-message ${msg.role === 'user' ? 'user' : 'bot'}`}>
            <div className="chat-interface-bubble">
              {msg.role === 'bot' ? (
                msg.text === '' ? (
                  <span className="chat-interface-typing">
                    <span /><span /><span />
                  </span>
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {msg.text}
                  </ReactMarkdown>
                )
              ) : (
                msg.text
              )}
            </div>
          </div>
        ))}
        {ephemeralError && (
          <div className="chat-interface-message bot">
            <div className="chat-interface-bubble chat-interface-bubble-error">{ephemeralError}</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {belowMessages}

      <div className="chat-interface-input-row">
        <div className="chat-interface-input-main">
          <textarea
            ref={textareaRef}
            className="chat-interface-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={isLoading}
          />
          <button
            className="chat-interface-send"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        {showModelSelect && (
          <select
            className="chat-interface-model-select"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
          >
            <option value="gemini">Gemini</option>
            <option value="grok">Grok</option>
            <option value="deepseek">DeepSeek</option>
          </select>
        )}
      </div>
    </>
  );
};

export default ChatInterface;