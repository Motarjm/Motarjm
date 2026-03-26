import React, { useState, useEffect } from 'react';
import {useLocation } from 'react-router-dom';
import '../assets/compare_interface.css';
import { API_URL } from '../apiConfig';
import FocusChatPanel from './FocusChatPanel';
import { trackNavigation, trackEvent } from '../analytics';

const CompareInterface = () => {
  const location = useLocation();
  const [activeSegment, setActiveSegment] = useState(null);
  const [translatedContents, setTranslatedContents] = useState(() => {
    // Load from sessionStorage on mount (for page refresh)
    const saved = sessionStorage.getItem('compare_translatedContents');
    return saved ? JSON.parse(saved) : null;
  });
  // eslint-disable-next-line no-unused-vars
  const [originalPdf, setOriginalPdf] = useState(null);
  const [sourceLang, setSourceLang] = useState('English');
  const [targetLang, setTargetLang] = useState('Arabic');
  const [checkedBlocks, setCheckedBlocks] = useState(() => {
    // Load from sessionStorage on mount
    const saved = sessionStorage.getItem('compare_checked_blocks');
    return saved ? JSON.parse(saved) : {};
  });
  const [openSuggestions, setOpenSuggestions] = useState({}); // keyed by "pageIndex-blockIndex" -> boolean
  const [suggestions, setSuggestions] = useState(() => {
    // Load from sessionStorage on mount
    const saved = sessionStorage.getItem('compare_suggestions');
    return saved ? JSON.parse(saved) : {};
  });
  const [suggestionsLoading, setSuggestionsLoading] = useState({}); // keyed by "pageIndex-blockIndex"
  const [openBackTranslations, setOpenBackTranslations] = useState({}); // keyed by "pageIndex-blockIndex" -> boolean
  const [backTranslations, setBackTranslations] = useState(() => {
    // Load from sessionStorage on mount
    const saved = sessionStorage.getItem('compare_backTranslations');
    return saved ? JSON.parse(saved) : {};
  });
  const [backTranslationLoading, setBackTranslationLoading] = useState({}); // keyed by "pageIndex-blockIndex"
  const [openExplanations, setOpenExplanations] = useState({}); // keyed by "pageIndex-blockIndex" -> boolean
  const [explanations, setExplanations] = useState(() => {
    const saved = sessionStorage.getItem('compare_explanations');
    return saved ? JSON.parse(saved) : {};
  });
  const [explanationLoading, setExplanationLoading] = useState({}); // keyed by "pageIndex-blockIndex"
  const [focusChatSegment, setFocusChatSegment] = useState(null); // "pageIndex-blockIndex" or null
  const [copiedSegment, setCopiedSegment] = useState(null); // Track which segment was copied
  // const API_URL = 'https://cosmoid-francis-barbarously.ngrok-free.dev';
  // const API_URL = 'http://localhost:8000';


  useEffect(() => {
    // Track navigation to compare interface
    trackNavigation('compare', 'translation_completed');
  }, []);

  useEffect(() => {   
    // Use location.key to distinguish between:
    // 1. Fresh navigation from Torgman.jsx (location.key changes)
    // 2. Page refresh (location.key stays the same)
    
    const currentKey = location.key;
    const lastNavKey = sessionStorage.getItem('last_nav_key');
    
    const isNewNavigation = currentKey !== lastNavKey;
    
    if (isNewNavigation) {
      // Fresh navigation from Torgman.jsx: use location.state data
      const { translatedContents: stateContents, originalPdf: statePdf, sourceLang: stateLang, targetLang: stateTarget } = location.state || {};
      
      setTranslatedContents(stateContents || null);
      setOriginalPdf(statePdf || null);
      setSourceLang(stateLang || 'English');
      setTargetLang(stateTarget || 'Arabic');
      
      // Update the last navigation key in sessionStorage
      sessionStorage.setItem('last_nav_key', currentKey);
    } else {
      // Page refresh: location.key matches the saved key
      // The lazy initializers have already loaded the edited content from sessionStorage.
      // Only restore metadata if needed.
      try {
        const savedData = sessionStorage.getItem('translationData');
        if (savedData) {
          const parsed = JSON.parse(savedData);
          setOriginalPdf(parsed.originalPdf || null);
          setSourceLang(parsed.sourceLang || 'English');
          setTargetLang(parsed.targetLang || 'Arabic');
        }
      } catch (e) {
        console.error('Failed to parse sessionStorage data:', e);
      }
    }
  }, [location.key, location.state]);

  // Save translatedContents to sessionStorage whenever it changes
  useEffect(() => {
    if (translatedContents) {
      try {
        sessionStorage.setItem('compare_translatedContents', JSON.stringify(translatedContents));
      } catch (e) {
        console.error('Failed to save translatedContents to sessionStorage:', e);
      }
    }
  }, [translatedContents]);

  // Persist checkedBlocks to sessionStorage on change
  useEffect(() => {
    sessionStorage.setItem('compare_checked_blocks', JSON.stringify(checkedBlocks));
  }, [checkedBlocks]);

  // Persist explanations to sessionStorage on change
  useEffect(() => {
    if (Object.keys(explanations).length > 0) {
      sessionStorage.setItem('compare_explanations', JSON.stringify(explanations));
    }
  }, [explanations]);

  // Persist backTranslations to sessionStorage on change
  useEffect(() => {
    if (Object.keys(backTranslations).length > 0) {
      sessionStorage.setItem('compare_backTranslations', JSON.stringify(backTranslations));
    }
  }, [backTranslations]);

  // Persist suggestions to sessionStorage on change
  useEffect(() => {
    if (Object.keys(suggestions).length > 0) {
      sessionStorage.setItem('compare_suggestions', JSON.stringify(suggestions));
    }
  }, [suggestions]);

  const handleSegmentClick = (pageIndex, blockIndex) => {
    setActiveSegment(`${pageIndex}-${blockIndex}`);
    const row = document.getElementById(`row-${pageIndex}-${blockIndex}`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Handle text editing
  const handleArabicEdit = (pageIndex, blockIndex, newText) => {
    setTranslatedContents(prevContents => {
      const newContents = JSON.parse(JSON.stringify(prevContents)); // Deep clone
      newContents[pageIndex][blockIndex].translated_text = newText;
      console.log('Updated translatedContents:', newContents);
      return newContents;
    });
  };

  // Send updated content to backend
  // const handleGeneratePDF = async () => {
  //   try {
  //     const response = await fetch(`${API_URL}/generation/pdf`, {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //       },
  //       body: JSON.stringify({
  //         translated_contents: translatedContents,
  //         original_pdf: originalPdf
  //       }),
  //     });

  //     if (!response.ok) {
  //       throw new Error('فشل إنشاء PDF');
  //     }

  //     const blob = await response.blob();

  //       // Convert blob to base64 for passing to next page
  //     const new_pdf_base64 = await new Promise((resolve, reject) => {
  //       const reader = new FileReader();
  //       reader.onloadend = () => resolve(reader.result.split(',')[1]);
  //       reader.onerror = reject;
  //       reader.readAsDataURL(blob);
  //     });
      
  //     // Navigate to the new page with the PDF
  //     navigate('/editing', {
  //       state: {
  //         newPdf: new_pdf_base64,
  //         originalPdf: originalPdf
  //       }
  //     });

  //   } catch (error) {
  //     console.error('Error generating PDF:', error);
  //     alert('حدث خطأ أثناء إنشاء PDF');
  //   }
  // };

  // Generate XLIFF file
  const handleGenerateXLIFF = async () => {
    try {
      const response = await fetch(`${API_URL}/generation/xliff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          translated_contents: translatedContents,
          source_lang: sourceLang,
          target_lang: targetLang
        }),
      });

      if (!response.ok) {
        throw new Error('فشل إنشاء ملف XLIFF');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'translation.xliff';
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error) {
      console.error('Error generating XLIFF:', error);
      alert('حدث خطأ أثناء إنشاء ملف XLIFF');
    }
  };

  // Generate per-segment back-translation
  const handleFetchBackTranslation = async (pageIndex, blockIndex) => {
    const key = `${pageIndex}-${blockIndex}`;
    // Toggle off if already open
    if (openBackTranslations[key]) {
      setOpenBackTranslations(prev => ({ ...prev, [key]: false }));
      return;
    }
    // Always re-fetch
    setOpenBackTranslations(prev => ({ ...prev, [key]: true }));
    setBackTranslationLoading(prev => ({ ...prev, [key]: true }));
    try {
      const pageBlocks = translatedContents[pageIndex];
      const response = await fetch(`${API_URL}/segment/backtranslation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_blocks: pageBlocks.map(b => b.translated_text),
          target_text: pageBlocks[blockIndex].translated_text,
          source_lang: sourceLang,
          target_lang: targetLang
        }),
      });
      if (!response.ok) throw new Error('Failed to fetch back-translation');
      const data = await response.json();
      setBackTranslations(prev => ({ ...prev, [key]: data.backtranslation }));
    } catch (error) {
      console.error('Error fetching back-translation:', error);
      setBackTranslations(prev => ({ ...prev, [key]: '__ERROR__' }));
    } finally {
      setBackTranslationLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleCheckboxChange = (pageIndex, blockIndex) => {
    const key = `${pageIndex}-${blockIndex}`;
    setCheckedBlocks(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      // Note: sessionStorage save is handled by the useEffect hook
      return updated;
    });
    setOpenSuggestions(prev => ({ ...prev, [key]: false }));
    setOpenExplanations(prev => ({ ...prev, [key]: false }));
    setOpenBackTranslations(prev => ({ ...prev, [key]: false }));
  };

  const handleFetchExplanation = async (pageIndex, blockIndex) => {
    const key = `${pageIndex}-${blockIndex}`;
    // Toggle off if already open
    if (openExplanations[key]) {
      setOpenExplanations(prev => ({ ...prev, [key]: false }));
      return;
    }
    // If already fetched and NOT an error, just show
    if (explanations[key] && explanations[key] !== '__ERROR__') {
      setOpenExplanations(prev => ({ ...prev, [key]: true }));
      return;
    }
    // Clear previous error if any, so we re-fetch
    if (explanations[key] === '__ERROR__') {
      setExplanations(prev => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });
    }
    setOpenExplanations(prev => ({ ...prev, [key]: true }));
    setExplanationLoading(prev => ({ ...prev, [key]: true }));
    try {

      const block = translatedContents[pageIndex][blockIndex];
      const response = await fetch(`${API_URL}/segment/explanation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block: block.original_text,
                                page_blocks: translatedContents[pageIndex].map(b => b.original_text)                
         }),
      });

      if (!response.ok) throw new Error('Failed to fetch explanation');
      const data = await response.json();
      setExplanations(prev => ({ ...prev, [key]: data.explanation }));
    } catch (error) {
      console.error('Error fetching explanation:', error);
      setExplanations(prev => ({
        ...prev,
        [key]: '__ERROR__',
      }));
    } finally {
      setExplanationLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleFetchSuggestions = async (pageIndex, blockIndex) => {
    const key = `${pageIndex}-${blockIndex}`;
    // Toggle off if already open
    if (openSuggestions[key]) {
      setOpenSuggestions(prev => ({ ...prev, [key]: false }));
      return;
    }
    // Always re-fetch
    setOpenSuggestions(prev => ({ ...prev, [key]: true }));
    setSuggestionsLoading(prev => ({ ...prev, [key]: true }));
    try {
      const pageBlocks = translatedContents[pageIndex];
      const response = await fetch(`${API_URL}/segment/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          page_blocks: pageBlocks.map(b => b.original_text),
          source_text: pageBlocks[blockIndex].original_text,
          translation: pageBlocks[blockIndex].translated_text,
          sourceLang: sourceLang,
          targetLang: targetLang
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch suggestions');
      const data = await response.json();
      // Expect data to be an array of { text, model } objects
      setSuggestions(prev => ({ ...prev, [key]: data }));
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      setSuggestions(prev => ({
        ...prev,
        [key]: '__ERROR__',
      }));
    } finally {
      setSuggestionsLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleApplySuggestion = (pageIndex, blockIndex, text) => {
    handleArabicEdit(pageIndex, blockIndex, text);
    
    // Track suggestion acceptance
    trackEvent('suggestion_accepted', {
      page_index: pageIndex,
      block_index: blockIndex,
      text_length: text.length,
      has_arabic: /[\u0600-\u06FF]/.test(text),
    });
    
    const key = `${pageIndex}-${blockIndex}`;
    setOpenSuggestions(prev => ({ ...prev, [key]: false }));
    // Update the contentEditable div directly
    const row = document.getElementById(`row-${key}`);
    if (row) {
      const editableDiv = row.querySelector('.arabic-side .segment-text');
      if (editableDiv) editableDiv.textContent = text;
    }
  };

  // Handle copy to clipboard
  const handleCopyToClipboard = (text, segmentId) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSegment(segmentId);
      // Reset the copied state after 2 seconds
      setTimeout(() => setCopiedSegment(null), 2000);
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  };

  // Calculate total segments and checked count
  const totalSegments = translatedContents
    ? translatedContents.reduce((sum, page) => sum + page.length, 0)
    : 0;
  const checkedCount = Object.values(checkedBlocks).filter(Boolean).length;
  const anyBtOpen = Object.values(openBackTranslations).some(Boolean);

  // Calculate segment ID for display
  let segmentCounter = 0;

  return (
    <div className="comparison-container">
      <div className="top-bar">
        <div className="top-bar-content">
          <span className="logo">ترجمان</span>
          <div className="button-group">
            <span className="progress-badge">
              ✓ {checkedCount} / {totalSegments}
            </span>
            {/* <button className="sidebar-btn" onClick={handleGeneratePDF}>
              Generate PDF
            </button> */}
            <button className="sidebar-btn" onClick={handleGenerateXLIFF}>
              Generate XLIFF
            </button>
          </div>
        </div>
      </div>
      
      <div className="comparison-content-wrapper">
        <div className="document-area">
          <div className={`document-container ${anyBtOpen ? 'bt-expanded' : ''}`}>
            <div className="comparison-table-header">
              <div className="header-spacer"></div>              
              <h2 className="column-header">الترجمة الإنجليزية</h2>
              <h2 className="column-header">النص العربي</h2>
            </div>

            {translatedContents && translatedContents.map((page, pageIndex) => (
              <div className="page-group" key={`page-${pageIndex}`}>
                <div className="page-divider">
                  <span className="page-divider-line"></span>
                  <span className="page-divider-label">صفحة {pageIndex + 1}</span>
                  <span className="page-divider-line"></span>
                </div>

                {page.map((block, blockIndex) => {
                  segmentCounter++;
                  const segmentId = `${pageIndex}-${blockIndex}`;
                  
                  return (
                    <div 
                      key={segmentId}
                      id={`row-${segmentId}`}
                      className={`segment-row ${activeSegment === segmentId ? 'active-row' : ''} ${openBackTranslations[segmentId] ? 'bt-open' : ''}`}
                      onClick={() => handleSegmentClick(pageIndex, blockIndex)}
                    >
                      <div className="segment-id-column">
                        {segmentCounter}
                        <input
                          type="checkbox"
                          title="Clear"
                          checked={!!checkedBlocks[segmentId]}
                          onChange={e => {
                            e.stopPropagation();
                            handleCheckboxChange(pageIndex, blockIndex);
                          }}
                          style={{ marginRight: 8, marginLeft: 8 }}
                        />
                      </div>

                      <div className="segment english-side">
                        <div className="english-side-inner">
                          <div className="segment-text" contentEditable={false}>
                            {block.original_text || ''}
                          </div>
                        </div>
                        {openExplanations[segmentId] && (
                          <div className="explanation-box" onClick={(e) => e.stopPropagation()}>
                            {explanationLoading[segmentId] ? (
                              <div className="explanation-loading">Loading explanation...</div>
                            ) : explanations[segmentId] === '__ERROR__' ? (
                              <div className="explanation-error">
                                ⚠️ Error occurred, please try again.
                              </div>
                            ) : (
                              <div 
                                className="explanation-text"
                                dangerouslySetInnerHTML={{
                                  __html: explanations[segmentId]?.replace(/\n/g, '<br />'),
                                }}
                              ></div>
                            )}
                          </div>
                        )}
                        <button
                          className={`segment-action-btn explanation-btn ${openExplanations[segmentId] ? 'active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleFetchExplanation(pageIndex, blockIndex); }}
                        >
                          📖 Explain
                        </button>
                      </div>

                      {/* Back-translation button between English and Arabic */}
                      <div className="segment-middle-actions">
                        <button
                          className={`segment-action-btn backtranslation-btn ${openBackTranslations[segmentId] ? 'active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleFetchBackTranslation(pageIndex, blockIndex); }}
                        >
                          🔄 ترجمة عكسية
                        </button>
                        {openBackTranslations[segmentId] && (
                          <div className="backtranslation-box" onClick={(e) => e.stopPropagation()}>
                            {backTranslationLoading[segmentId] ? (
                              <div className="explanation-loading">Loading back-translation...</div>
                            ) : backTranslations[segmentId] === '__ERROR__' ? (
                              <div className="explanation-error">⚠️ Error occurred, please try again.</div>
                            ) : (
                              <div className="explanation-text">{backTranslations[segmentId]}</div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="segment arabic-side">
                        <div className="arabic-side-inner">
                          <div
                            className="segment-text"
                            contentEditable={true}
                            suppressContentEditableWarning
                            onBlur={(e) => handleArabicEdit(pageIndex, blockIndex, e.currentTarget.textContent)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {block.translated_text || ''}
                          </div>
                          <button
                            className={`copy-btn ${copiedSegment === segmentId ? 'copied' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyToClipboard(block.translated_text, segmentId);
                            }}
                            title="Copy translation"
                          >
                            {copiedSegment === segmentId ? '✓' : '📋'}
                          </button>
                        </div>
                        {openSuggestions[segmentId] && (
                          <div className="suggestions-panel" onClick={(e) => e.stopPropagation()}>
                            {suggestionsLoading[segmentId] ? (
                              <div className="suggestions-loading">جاري التحميل...</div>
                            ) : suggestions[segmentId] === '__ERROR__' ? (
                              <div className="explanation-error">
                                ⚠️ Error occurred, please try again.
                              </div>
                            ) : (
                              suggestions[segmentId]?.map((s, i) => (
                                <div className="suggestion-card" key={i}>
                                  <div className="suggestion-card-meta">
                                    <span className="suggestion-model-label">{s.model}</span>
                                  </div>
                                  <div className="suggestion-card-text">{s.text}</div>
                                  <button
                                    className="suggestion-apply-btn"
                                    onClick={(e) => { e.stopPropagation(); handleApplySuggestion(pageIndex, blockIndex, s.text); }}
                                  >
                                    ✓
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                        <div className="segment-action-row">
                          <button
                            className={`segment-action-btn suggestions-btn ${openSuggestions[segmentId] ? 'active' : ''}`}
                            onClick={(e) => { e.stopPropagation(); handleFetchSuggestions(pageIndex, blockIndex); }}
                          >
                            💡 اقتراحات
                          </button>
                          <button
                            className="segment-action-btn focus-btn"
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              // Track opening focus chat
                              trackEvent('focus_chat_opened', {
                                segment_id: segmentId,
                                page_index: pageIndex,
                                block_index: blockIndex,
                              });
                              setFocusChatSegment({ pageIndex, blockIndex, id: segmentId }); 
                            }}
                          >
                            💬 Chat
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {focusChatSegment && translatedContents && (
        <FocusChatPanel
          segment={translatedContents[focusChatSegment.pageIndex][focusChatSegment.blockIndex]}
          segmentId={focusChatSegment.id}
          pageContext={translatedContents[focusChatSegment.pageIndex].map(b => b.original_text)}
          docContext={translatedContents.map(page => page.map(block => block.original_text))}
          sourceLang={sourceLang}
          targetLang={targetLang}
          onClose={() => setFocusChatSegment(null)}
          onEditTranslation={(newText) => {
            handleArabicEdit(focusChatSegment.pageIndex, focusChatSegment.blockIndex, newText);
          }}
        />
      )}
    </div>
  );
};

export default CompareInterface;