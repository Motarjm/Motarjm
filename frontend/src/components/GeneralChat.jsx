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
  text: '👋 Hello! \n\nYou can ask me about terminology, style, whole document, or specific segments.\n\n I can also search the web when a question needs current information.',
};

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

  // Full backend-facing history, including tool turns (search calls/results).
  // This is NEVER rendered — only `messages` (user/bot only) drives the UI.
  const chatHistoryRef = useRef([]);

  // Quick-action state
  const [activeQuickAction, setActiveQuickAction] = useState(null); // null | 'replace'
  const [tmSegmentMatches, setTmSegmentMatches] = useState([]);
  const [tmLoading, setTmLoading] = useState(false);

  const [findTerm, setFindTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');

  // Terms extraction: the file is prepared server-side, but we no longer
  // auto-download it — we surface a banner with a button and let the user
  // decide when to grab it.
  const [pendingTermsFile, setPendingTermsFile] = useState(null); // { fileId } | null
  const [termsDownloading, setTermsDownloading] = useState(false);

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
    const parsed = saved ? JSON.parse(saved) : null;
    setMessages(parsed?.messages || [{ ...WELCOME_MESSAGE }]);
    chatHistoryRef.current = parsed?.chatHistory || [];
  } catch {
    setMessages([{ ...WELCOME_MESSAGE }]);
    chatHistoryRef.current = [];
  }
  setMessagesLoaded(true);
}, [documentId]);

  useEffect(() => {
    if (!messagesLoaded || !documentId) return;
    try {
      localStorage.setItem(`torgman-chat-${documentId}`, JSON.stringify({
        messages,
        chatHistory: chatHistoryRef.current,
      }));
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

  const streamResponse = async (userText = null, { silent = false } = {}) => {
    if (loading) return;
    setLoading(true);

    let botMessageId = null;
    let fullText = '';
    let activeToolCall = null;      // { id, name, args } while a search is in flight
    const toolEntriesThisTurn = []; // completed {role:'tool', ...} entries, for chat_history only
    // Own this call's AbortController so Clear (or an unmount) can cancel
    // the underlying fetch instead of letting it keep streaming — and so
    // trailing updates below can check whether that's happened.
    const controller = new AbortController();
    abortRef.current = controller;

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
        signal: controller.signal,
        body: JSON.stringify({
          chat_history: chatHistoryRef.current,
          style_guide: styleGuideQueryValue || '',
          translated_contents: translatedContents,
          source_lang: sourceLang,
          target_lang: targetLang,
          review_results: reviewContextDismissed ? null : (reviewResults || null),
          glossary: glossary || {},
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
              // Only surface a visible "searching" chip for web search.
              // extract_terminology is NOT a search and has no URLs to show;
              // it later surfaces via file_ready as a bot message.
              activeToolCall = { id: payload.id, name: payload.tool, args: { query: payload.query } };

              if (payload.tool === 'exa_search') {
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
              }
              // For extract_terminology we intentionally do NOT add a role:'tool'
              // message, so SearchToolBlock never renders for it.

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

            } else if (payload.type === 'file_ready') {
              // Model called extract_terminology — download the file it
              // prepared, and drop a small confirmation into the chat.
              toolEntriesThisTurn.push({
                role: 'tool',
                tool_call_id: payload.id,
                name: 'extract_terminology',
                args: {},
                content: payload.content || JSON.stringify({ file_id: payload.file_id }),
              });

              if (payload.file_id) {
                // Don't download automatically — surface a banner and let
                // the user trigger the download themselves.
                setPendingTermsFile({ fileId: payload.file_id });
              }

            } else if (payload.type === 'token') {
              fullText += payload.content;
              const displayText = stripStreamingJsonBlock(fullText);
              if (!botMessageId) {
                botMessageId = `bot-${Date.now()}`;
                setMessages(prev => [...prev, { role: 'bot', text: displayText, id: botMessageId }]);
              } else {
                const targetId = botMessageId;
                setMessages(prev =>
                  prev.map(msg => msg.id === targetId ? { ...msg, text: displayText } : msg)
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

      // If Clear fired while we were mid-stream, stop here entirely — no
      // message update, no history tracking, and critically no onChatSuggestion
      // call later. A conversation the user already discarded shouldn't be able
      // to plant a pending suggestion or leave a stray tool call in history.
      if (controller.signal.aborted) return;

      // Final stripped text — the raw fullText (with the JSON block intact)
      // is kept around below for action-parsing and chat history only.
      const displayText = stripStreamingJsonBlock(fullText);
      setMessages(prev =>
        prev.some(msg => msg.id === botMessageId)
          ? prev.map(msg => msg.id === botMessageId ? { ...msg, text: displayText } : msg)
          : prev // the bot placeholder is gone (cleared) — nothing to update
      );

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
      setMessages(prev => {
        if (botMessageId && prev.some(msg => msg.id === botMessageId)) {
          return prev.map(msg =>
            msg.id === botMessageId ? { ...msg, text: '⚠️ Sorry, an error occurred. Please try again.' } : msg
          );
        }
        if (botMessageId) {
          // A bot message existed for this turn but isn't in `prev` anymore
          // (e.g. Clear ran) — don't resurrect it.
          return prev;
        }
        return [...prev, { role: 'bot', text: '⚠️ Sorry, an error occurred. Please try again.' }];
      });
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
    streamResponse(hiddenPrompt, { silent: true });
  }, [reviewResults]);

  const handleSend = (text) => {
    streamResponse(text);
  };

  const handleClear = () => {
  // Cancel any in-flight response (e.g. the auto-triggered "review just
  // finished" summary) so it can't land after the clear and repopulate
  // the chat or plant a suggestion on a segment.
  abortRef.current?.abort();
  abortRef.current = null;
  setLoading(false);

  setMessages([{ ...WELCOME_MESSAGE }]);
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

  const handleDownloadTerms = () => {
    if (!pendingTermsFile) return;
    setTermsDownloading(true);
    fetch(`${API_URL}/document/terms-download/${pendingTermsFile.fileId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'terminology.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        trackEvent('extract_terms', { document_id: documentId, via: 'chat_tool' });
        setPendingTermsFile(null);
      })
      .catch((e) => console.error('Terminology download error:', e))
      .finally(() => setTermsDownloading(false));
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
                className="quick-chip"
                onClick={() => handleSend('Extract key terms from the document.')}
                disabled={loading}
                title="Extract terminology from document"
              >
                <span className="chip-icon">📚</span> Extract Key Terms
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

          {pendingTermsFile && (
            <div className="terms-ready-banner">
              <div className="batch-banner-text">
                📚 Terminology extraction ready
              </div>
              <div className="batch-banner-actions">
                <button
                  className="batch-btn apply"
                  onClick={handleDownloadTerms}
                  disabled={termsDownloading}
                >
                  {termsDownloading ? 'Downloading…' : 'Download'}
                </button>
                <button
                  className="batch-btn dismiss"
                  onClick={() => setPendingTermsFile(null)}
                  disabled={termsDownloading}
                >
                  Dismiss
                </button>
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