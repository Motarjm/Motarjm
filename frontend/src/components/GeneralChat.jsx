import React, { useState, useRef, useEffect, useMemo } from 'react';
import '../assets/general_chat.css';
import ChatInterface from './ChatInterface';
import { API_URL } from '../apiConfig';
import { trackEvent } from '../analytics';
import TermbaseTab from './TermbaseTab';
import TranslationMemoryTab from './TranslationMemoryTab';
import FocusChatPanel from './FocusChatPanel';
import { findMatchesClient } from '../utils/glossaryMatch';

const WELCOME_MESSAGE = {
  role: 'bot',
  text: '👋 Hello! You can ask me about terminology, style, whole document, or specific segments and I can apply changes automatically.',
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
  pendingReviewCount,
  onBatchApply,
  onBatchDismiss,
  onNavigateSuggestion,
  glossary,
  activeSegmentSource,
  tmId,
  // ── Segment-scope props (all optional — panel degrades gracefully
  // to an empty state if no segment is active) ──
  activeSegmentId,        // "pageIndex-blockIndex" of the currently active segment, or null
  activeSegmentBlock,     // { original_text, translated_text } for that segment
  pageContext,            // array of source texts for the active segment's page (segment chat)
  docContext,             // full document source texts (segment chat)
  onEditActiveSegment,    // (newText) => void — applies an edit to the active segment
  explanations,
  explanationLoading,
  onEnsureExplanation,    // (forceRetry) => void
  suggestions,
  suggestionsLoading,
  onEnsureSuggestions,    // (forceRetry) => void
  onApplySuggestion,      // (text) => void
}) => {
  const [messages, setMessages] = useState([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState('claude');
  const [width, setWidth] = useState(470);
  const [isResizing, setIsResizing] = useState(false);
  // ── Two-tier scope: which top-level context the panel is showing ──
  const [scope, setScope] = useState('document'); // 'document' | 'segment'
  // ── Sub-tab within Segment scope ──
  const [segmentTab, setSegmentTab] = useState('suggestions');
  const [reviewContextDismissed, setReviewContextDismissed] = useState(false);

  const [tmSegmentMatches, setTmSegmentMatches] = useState([]);
  const [tmLoading, setTmLoading] = useState(false);

  const [activeQuickAction, setActiveQuickAction] = useState(null);
  const [findTerm, setFindTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');

  const messagesEndRef = useRef(null);
  const abortRef = useRef(null); // AbortController for the in-flight streamResponse call, if any

  // Human-friendly segment number ("Segment #6") for the scope toggle label
  const activeSegmentNumber = useMemo(() => {
    if (!activeSegmentId || !translatedContents) return null;
    const [pageStr, blockStr] = activeSegmentId.split('-');
    const page = parseInt(pageStr, 10);
    const block = parseInt(blockStr, 10);
    let num = 0;
    for (let p = 0; p < page; p++) {
      if (translatedContents[p]) num += translatedContents[p].length;
    }
    return num + block + 1;
  }, [activeSegmentId, translatedContents]);

  // Lazily fetch explanation / suggestions when their sub-tab is opened
  useEffect(() => {
    if (scope !== 'segment' || !activeSegmentId) return;
    if (segmentTab === 'explain' && onEnsureExplanation) {
      onEnsureExplanation(false);
    } else if (segmentTab === 'suggestions' && onEnsureSuggestions) {
      onEnsureSuggestions(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, segmentTab, activeSegmentId]);

  // ─── badge counts ───
  const termbaseCount = useMemo(() => {
    if (!activeSegmentSource || !glossary || Object.keys(glossary).length === 0) return 0;
    return findMatchesClient(activeSegmentSource, glossary).length;
  }, [activeSegmentSource, glossary]);

  const tmCount = tmSegmentMatches.length;

  // ─── fetch TM matches for current segment (lifted from TranslationMemoryTab) ───
  useEffect(() => {
    if (!tmId || !activeSegmentSource) {
      setTmSegmentMatches([]);
      return;
    }
    setTmLoading(true);
    fetch(
      `${API_URL}/translation/tm/search?tm_id=${encodeURIComponent(tmId)}&query=${encodeURIComponent(activeSegmentSource)}&top_k=5&mode=token`
    )
      .then((res) => {
        if (!res.ok) throw new Error('TM search failed');
        return res.json();
      })
      .then((data) => {
        setTmSegmentMatches(data.matches || []);
      })
      .catch((e) => {
        console.warn('TM segment search error:', e);
        setTmSegmentMatches([]);
      })
      .finally(() => setTmLoading(false));
  }, [activeSegmentSource, tmId]);

  useEffect(() => {
    const key = `torgman-chat-${documentId}`;
    try {
      const saved = localStorage.getItem(key);
      setMessages(saved ? JSON.parse(saved) : [{ ...WELCOME_MESSAGE }]);
    } catch {
      setMessages([{ ...WELCOME_MESSAGE }]);
    }
    setMessagesLoaded(true);
  }, [documentId]);

  useEffect(() => {
    if (!messagesLoaded || !documentId) return;
    try {
      localStorage.setItem(`torgman-chat-${documentId}`, JSON.stringify(messages));
    } catch {}
  }, [messages, documentId, messagesLoaded]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

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

    // Own this call's AbortController so Clear (or an unmount) can cancel
    // the underlying fetch instead of letting it keep streaming — and so
    // trailing updates below can check whether that's happened.
    const controller = new AbortController();
    abortRef.current = controller;

    if (userText) {
      setMessages(prev => [...prev, { role: 'user', text: userText }]);
    }
    try {
      const response = await fetch(`${API_URL}/document/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          chat_history: chatHistoryToSend,
          style_guide: styleGuideQueryValue || '',
          translated_contents: translatedContents,
          source_lang: sourceLang,
          target_lang: targetLang,
          review_results: reviewContextDismissed ? null : (reviewResults || null),
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

      // If Clear fired while we were mid-stream, stop here entirely — no
      // message update, no tracking, and critically no onChatSuggestion
      // call. A conversation the user already discarded shouldn't be able
      // to plant a pending suggestion on a segment after the fact.
      if (controller.signal.aborted) return;

      setMessages(prev =>
        prev.some(msg => msg.id === botMessageId)
          ? prev.map(msg => msg.id === botMessageId ? { ...msg, text: fullText } : msg)
          : prev // the bot placeholder is gone (cleared) — nothing to update
      );

      if (userText) {
        trackEvent('general_chat_message', {
          message_length: userText.length,
          response_length: fullText.length,
          document_id: documentId,
        });
      }

      const jsonMatch = fullText.match(/```json\s*({.*?})\s*```/s);
      if (jsonMatch) {
        try {
          const action = JSON.parse(jsonMatch[1]);
          if (action.action === 'edit_translation') {
            const edits = Array.isArray(action.edits) ? action.edits : [action];
            const suggestedSegments = [];
            edits.forEach(({ segment_id, new_text }) => {
              if (onChatSuggestion) {
                onChatSuggestion(segment_id, new_text, 'Chat suggestion');
                suggestedSegments.push(segment_id);
              }
            });
            const cleanText = fullText.replace(/```json\s*{.*?}\s*```/s, '').trim();
            const segmentLinks = suggestedSegments.map((id) => {
              const [page, block] = id.split('-');
              let segmentNumber = 0;
              for (let p = 0; p < parseInt(page); p++) {
                if (translatedContents[p]) {
                  segmentNumber += translatedContents[p].length;
                }
              }
              segmentNumber += parseInt(block) + 1;
              return `[Segment ${segmentNumber}](#segment-${id})`;
            });
            const segmentList = segmentLinks.join(', ');
            const confirmationText = `\n\n📝 Added ${edits.length} suggestion(s) for review: ${segmentList}`;
            setMessages(prev =>
              prev.some(msg => msg.id === botMessageId)
                ? prev.map(msg => msg.id === botMessageId ? { ...msg, text: cleanText + confirmationText } : msg)
                : prev
            );
          }
        } catch (e) {
          console.warn('Failed to parse action JSON:', e);
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        // Clear was clicked mid-stream — not a real error, nothing to show.
        return;
      }
      console.error('General chat error:', error);
      setMessages(prev =>
        prev.map((msg, i) =>
          i === prev.length - 1 && msg.role === 'bot' && msg.id
            ? { ...msg, text: '⚠️ Sorry, an error occurred. Please try again.' }
            : msg
        )
      );
    } finally {
      setLoading(false);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (!reviewResults || reviewResults.length === 0) return;
    setReviewContextDismissed(false);
    const changedCount = reviewResults.filter(r => r.changed).length;
    const hiddenPrompt = `The document review just finished. ${changedCount} out of ${reviewResults.length} segments were revised. Summarize what was changed and why, referencing specific segments where useful.`;
    streamResponse([{ role: 'user', text: hiddenPrompt }]);
  }, [reviewResults]);

  const handleSend = (text) => {
    const userMessage = { role: 'user', text };
    streamResponse(messages.concat(userMessage), text);
  };

  const handleClear = () => {
    // Cancel any in-flight response (e.g. the auto-triggered "review just
    // finished" summary) so it can't land after the clear and repopulate
    // the chat or plant a suggestion on a segment.
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);

    setMessages([{ ...WELCOME_MESSAGE }]);
    try { localStorage.removeItem(`torgman-chat-${documentId}`); } catch {}
    setReviewContextDismissed(true);
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

  const segmentHasContext = !!activeSegmentId;

  return (
    <div className="general-chat-panel" style={{ width: `${width}px` }}>
      <div
        className={`general-chat-resizer ${isResizing ? 'active' : ''}`}
        onMouseDown={() => setIsResizing(true)}
        title="Drag to resize"
      />

      <div className="general-chat-header">
        {/* ── Top-level scope switch: Document vs Segment ── */}
        <div className="scope-tabs">
          <button
            className={`scope-tab-btn ${scope === 'document' ? 'active' : ''}`}
            onClick={() => setScope('document')}
          >
            Document
          </button>
          <button
            className={`scope-tab-btn scope-tab-segment ${scope === 'segment' ? 'active' : ''} ${!segmentHasContext ? 'disabled' : ''}`}
            onClick={() => segmentHasContext && setScope('segment')}
            disabled={!segmentHasContext}
            title={segmentHasContext ? `Segment #${activeSegmentNumber}` : 'Click a segment to see its context'}
          >
            {segmentHasContext ? `Segment #${activeSegmentNumber}` : 'Segment'}
          </button>
        </div>
        {scope === 'document' && (
          <button className="general-chat-clear-btn" onClick={handleClear} title="Clear conversation">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </button>
        )}
      </div>

      {/* ═══════════════ Document scope ═══════════════ */}
      {scope === 'document' && (
        <>
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
                  onChange={(e) => setFindTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleReplaceSubmit()}
                  autoFocus
                />
                <span className="qa-arrow">→</span>
                <input
                  className="qa-input"
                  placeholder="Replace with…"
                  value={replaceTerm}
                  onChange={(e) => setReplaceTerm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleReplaceSubmit()}
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

          {pendingReviewCount > 0 && (
            <div className="batch-action-banner">
              <div className="batch-banner-text">
                <strong>{pendingReviewCount}</strong> pending suggestion(s)
              </div>
              <div className="batch-banner-actions">
                <button
                  className="batch-nav-btn"
                  onClick={() => onNavigateSuggestion && onNavigateSuggestion('prev')}
                  title="Previous suggestion"
                >
                  ↑
                </button>
                <button
                  className="batch-nav-btn"
                  onClick={() => onNavigateSuggestion && onNavigateSuggestion('next')}
                  title="Next suggestion"
                >
                  ↓
                </button>
                <button className="batch-btn apply" onClick={onBatchApply}>Apply All</button>
                <button className="batch-btn dismiss" onClick={onBatchDismiss}>Dismiss All</button>
              </div>
            </div>
          )}

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
        </>
      )}

      {/* ═══════════════ Segment scope ═══════════════ */}
      {scope === 'segment' && (
        <>
          <div className="segment-subtabs">
            <button
              className={`segment-subtab-btn ${segmentTab === 'suggestions' ? 'active' : ''}`}
              onClick={() => setSegmentTab('suggestions')}
            >
              💡 Suggestions
            </button>
            <button
              className={`segment-subtab-btn ${segmentTab === 'explain' ? 'active' : ''}`}
              onClick={() => setSegmentTab('explain')}
            >
              📖 Explain
            </button>
            <button
              className={`segment-subtab-btn ${segmentTab === 'chat' ? 'active' : ''}`}
              onClick={() => setSegmentTab('chat')}
            >
              💬 Chat
            </button>
            <button
              className={`segment-subtab-btn ${segmentTab === 'tm' ? 'active' : ''}`}
              onClick={() => setSegmentTab('tm')}
            >
              TM
              {tmCount > 0 && <span className="termbase-badge">{tmCount}</span>}
            </button>
            <button
              className={`segment-subtab-btn ${segmentTab === 'termbase' ? 'active' : ''}`}
              onClick={() => setSegmentTab('termbase')}
            >
              Termbase
              {termbaseCount > 0 && <span className="termbase-badge">{termbaseCount}</span>}
            </button>
          </div>

          {!segmentHasContext ? (
            <div className="segment-tab-content">
              <div className="tab-empty-state">
                Click a segment in the document to see suggestions, an explanation, a focused chat, translation memory and termbase matches for it.
              </div>
            </div>
          ) : (
            <>
              {segmentTab === 'suggestions' && (
                <div className="segment-tab-content">
                  {/* ── Regenerate button ── */}
                  <div className="suggestions-header" style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px', borderBottom: '1px solid #e5e7eb' }}>
                    <button
                      className="regenerate-btn"
                      onClick={() => onEnsureSuggestions && onEnsureSuggestions(true)}
                      disabled={suggestionsLoading?.[activeSegmentId] || !activeSegmentId}
                      title="Regenerate suggestions"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                      </svg>
                      Regenerate
                    </button>
                  </div>
                  {suggestionsLoading?.[activeSegmentId] ? (
                    <div className="suggestions-loading">Loading suggestions…</div>
                  ) : suggestions?.[activeSegmentId] === '__ERROR__' ? (
                    <div className="explanation-error">
                      ⚠️ Something went wrong.
                      <button className="retry-btn" onClick={() => onEnsureSuggestions && onEnsureSuggestions(true)}>Retry</button>
                    </div>
                  ) : suggestions?.[activeSegmentId]?.length ? (
                    suggestions[activeSegmentId].map((s, i) => (
                      <div className="suggestion-card" key={i}>
                        <div className="suggestion-card-meta">
                          <span className="suggestion-model-label">{s.model}</span>
                        </div>
                        <div className="suggestion-card-text">{s.text}</div>
                        <button
                          className="suggestion-apply-btn"
                          onClick={() => onApplySuggestion && onApplySuggestion(s.text)}
                        >
                          ✓
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="tab-empty-state">No suggestions yet.</div>
                  )}
                </div>
              )}

              {segmentTab === 'explain' && (
                <div className="segment-tab-content">
                  {explanationLoading?.[activeSegmentId] ? (
                    <div className="explanation-loading">Loading explanation…</div>
                  ) : explanations?.[activeSegmentId] === '__ERROR__' ? (
                    <div className="explanation-error">
                      ⚠️ Something went wrong.
                      <button className="retry-btn" onClick={() => onEnsureExplanation && onEnsureExplanation(true)}>Retry</button>
                    </div>
                  ) : explanations?.[activeSegmentId] ? (
                    <div
                      className="explanation-text"
                      dangerouslySetInnerHTML={{
                        __html: explanations[activeSegmentId]?.replace(/\n/g, '<br />'),
                      }}
                    />
                  ) : (
                    <div className="tab-empty-state">No explanation available yet.</div>
                  )}
                </div>
              )}

              {segmentTab === 'chat' && (
                <FocusChatPanel
                  embedded
                  documentId={documentId}
                  segment={activeSegmentBlock}
                  segmentId={activeSegmentId}
                  pageContext={pageContext}
                  docContext={docContext}
                  sourceLang={sourceLang}
                  targetLang={targetLang}
                  styleGuideQueryValue={styleGuideQueryValue}
                  onEditTranslation={onEditActiveSegment}
                />
              )}

              {segmentTab === 'tm' && (
                <div key="tm" className="tm-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                  {tmId ? (
                    <TranslationMemoryTab
                      tmId={tmId}
                      activeSegmentSource={activeSegmentSource}
                      segmentMatches={tmSegmentMatches}
                      loadingSegment={tmLoading}
                    />
                  ) : (
                    <div className="segment-tab-content">
                      <div className="tab-empty-state">No translation memory attached to this document.</div>
                    </div>
                  )}
                </div>
              )}

              {segmentTab === 'termbase' && (
                <div key="termbase" className="termbase-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                  {glossary && Object.keys(glossary).length > 0 ? (
                    <TermbaseTab
                      glossary={glossary}
                      activeSegmentSource={activeSegmentSource}
                    />
                  ) : (
                    <div className="segment-tab-content">
                      <div className="tab-empty-state">No glossary attached to this document.</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

    </div>
  );
};

export default GeneralChat;