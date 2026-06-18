import React, { useState, useRef, useEffect } from 'react';
import '../assets/general_chat.css';
import { API_URL } from '../apiConfig';
import { trackEvent } from '../analytics';

const GeneralChat = ({
  documentId,
  translatedContents,
  sourceLang,
  targetLang,
  styleGuideQueryValue,
}) => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: '👋 Hello! I can help with this translation. Ask me about terminology, style, or specific segments.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [width, setWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Auto-focus input on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // ── Resize logic ──
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      // Since the panel is on the right, its left edge is at (window.innerWidth - width)
      // Dragging left increases width, dragging right decreases it.
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 200 && newWidth < window.innerWidth * 0.7) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage = { role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    const context = {
      translatedContents,
      sourceLang,
      targetLang,
      styleGuide: styleGuideQueryValue || '',
    };

    try {
      const response = await fetch(`${API_URL}/general/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.concat(userMessage),
          context,
        }),
      });

      if (!response.ok) throw new Error('Chat request failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      const botMessageId = Date.now();
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: '', id: botMessageId },
      ]);

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
                prev.map(msg =>
                  msg.id === botMessageId
                    ? { ...msg, content: fullText }
                    : msg
                )
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
        prev.map(msg =>
          msg.id === botMessageId ? { ...msg, content: fullText } : msg
        )
      );

      trackEvent('general_chat_message', {
        message_length: trimmed.length,
        response_length: fullText.length,
        document_id: documentId,
      });
    } catch (error) {
      console.error('General chat error:', error);
      setMessages(prev => {
        const newMessages = [...prev];
        const last = newMessages[newMessages.length - 1];
        if (last && last.role === 'assistant' && last.id) {
          last.content = '⚠️ Sorry, an error occurred. Please try again.';
        }
        return newMessages;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="general-chat-panel" style={{ width: `${width}px` }}>
      {/* Resizer handle */}
      <div
        className={`general-chat-resizer ${isResizing ? 'active' : ''}`}
        onMouseDown={() => setIsResizing(true)}
        title="Drag to resize"
      />

      <div className="general-chat-header">
        <span className="general-chat-title">💬 General Assistant</span>
      </div>

      <div className="general-chat-messages">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`general-chat-message ${msg.role === 'user' ? 'user' : 'assistant'}`}
          >
            <div className="general-chat-bubble">
              {msg.content || (msg.role === 'assistant' && '…')}
            </div>
          </div>
        ))}
        {loading && (
          <div className="general-chat-message assistant">
            <div className="general-chat-bubble typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="general-chat-input-area">
        <textarea
          ref={inputRef}
          className="general-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          rows={1}
          disabled={loading}
        />
        <button
          className="general-chat-send"
          onClick={sendMessage}
          disabled={!input.trim() || loading}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default GeneralChat;