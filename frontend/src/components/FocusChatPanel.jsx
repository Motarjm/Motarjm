import React, { useState, useRef, useEffect } from 'react';
import '../assets/focus_chat.css';

const FocusChatPanel = ({ segment, segmentId, onClose, onEditTranslation }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('deepseek');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { role: 'user', text: input }]);
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'bot', text: 'This is a placeholder response.' }]);
    }, 500);
    setInput('');
  };

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
            {messages.length === 0 && (
              <div className="focus-chat-empty">
                Ask anything about this segment…     
                </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`focus-chat-msg focus-chat-msg-${msg.role}`}>
                {msg.text}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="focus-chat-input-row">
            <select
              className="focus-chat-model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              <option value="deepseek">DeepSeek</option>
              <option value="gemini">Gemini</option>
              <option value="grok">Grok</option>
            </select>
            <textarea
              className="focus-chat-input"
              placeholder="Type a message…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
            />
            <button className="focus-chat-send" onClick={handleSend}>↑</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FocusChatPanel;
