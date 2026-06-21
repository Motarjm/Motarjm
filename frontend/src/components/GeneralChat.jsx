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
}) => {
  const [messages, setMessages] = useState([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState('gemini');
  const [width, setWidth] = useState(470);
  const [isResizing, setIsResizing] = useState(false);
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