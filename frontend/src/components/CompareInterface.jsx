import React, { useState, useEffect } from 'react';
import {useLocation, useNavigate } from 'react-router-dom';
import '../assets/compare_interface.css';
import { API_URL } from '../apiConfig';
import FocusChatPanel from './FocusChatPanel';

const CompareInterface = () => {
  const location = useLocation();
  const [activeSegment, setActiveSegment] = useState(null);
  const [translatedContents, setTranslatedContents] = useState(null);
  const [originalPdf, setOriginalPdf] = useState(null);
  const [sourceLang, setSourceLang] = useState('English');
  const [targetLang, setTargetLang] = useState('Arabic');
  const [checkedBlocks, setCheckedBlocks] = useState(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('compare_checked_blocks');
    return saved ? JSON.parse(saved) : {};
  });
  const [openSuggestions, setOpenSuggestions] = useState({}); // keyed by "pageIndex-blockIndex" -> boolean
  const [suggestions, setSuggestions] = useState({}); // keyed by "pageIndex-blockIndex"
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [openBackTranslations, setOpenBackTranslations] = useState({}); // keyed by "pageIndex-blockIndex" -> boolean
  const [backTranslations, setBackTranslations] = useState({}); // keyed by "pageIndex-blockIndex" -> string
  const [backTranslationLoading, setBackTranslationLoading] = useState({}); // keyed by "pageIndex-blockIndex"
  const [openExplanations, setOpenExplanations] = useState({}); // keyed by "pageIndex-blockIndex" -> boolean
  const [explanations, setExplanations] = useState(() => {
    const saved = localStorage.getItem('compare_explanations');
    return saved ? JSON.parse(saved) : {};
  });
  const [explanationLoading, setExplanationLoading] = useState({}); // keyed by "pageIndex-blockIndex"
  const [focusChatSegment, setFocusChatSegment] = useState(null); // "pageIndex-blockIndex" or null
  const navigate = useNavigate();
  // const API_URL = 'https://cosmoid-francis-barbarously.ngrok-free.dev';
  // const API_URL = 'http://localhost:8000';


  useEffect(() => {   
    const { translatedContents, originalPdf, sourceLang, targetLang } = location.state || {};
    if (translatedContents) setTranslatedContents(translatedContents);
    if (originalPdf) setOriginalPdf(originalPdf);
    if (sourceLang) setSourceLang(sourceLang);
    if (targetLang) setTargetLang(targetLang);
  }, [location.state]);

  // Persist explanations to localStorage on change; clear on navigation away (but not refresh)
  useEffect(() => {
    if (Object.keys(explanations).length > 0) {
      localStorage.setItem('compare_explanations', JSON.stringify(explanations));
    }
  }, [explanations]);

  useEffect(() => {
    let isRefresh = false;
    const handleBeforeUnload = () => { isRefresh = true; };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (!isRefresh) {
        localStorage.removeItem('compare_explanations');
      }
    };
  }, []);

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
  const handleGeneratePDF = async () => {
    try {
      const response = await fetch(`${API_URL}/translate/generate-edited-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          translated_contents: translatedContents,
          original_pdf: originalPdf
        }),
      });

      if (!response.ok) {
        throw new Error('فشل إنشاء PDF');
      }

      const blob = await response.blob();

        // Convert blob to base64 for passing to next page
      const new_pdf_base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      // Navigate to the new page with the PDF
      navigate('/editing', {
        state: {
          newPdf: new_pdf_base64,
          originalPdf: originalPdf
        }
      });

    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('حدث خطأ أثناء إنشاء PDF');
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
      const response = await fetch(`${API_URL}/translate/backtranslation`, {
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
      localStorage.setItem('compare_checked_blocks', JSON.stringify(updated));
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
      const response = await fetch(`${API_URL}/translate/explanation`, {
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
    setSuggestionsLoading(true);
    try {
      const pageBlocks = translatedContents[pageIndex];
      const response = await fetch(`${API_URL}/translate/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          page_blocks: pageBlocks.map(b => b.original_text),
          source_text: pageBlocks[blockIndex].original_text,
          translation: pageBlocks[blockIndex].translated_text,
          source_lang: sourceLang,
          target_lang: targetLang
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
      setSuggestionsLoading(false);
    }
  };

  const handleApplySuggestion = (pageIndex, blockIndex, text) => {
    handleArabicEdit(pageIndex, blockIndex, text);
    const key = `${pageIndex}-${blockIndex}`;
    setOpenSuggestions(prev => ({ ...prev, [key]: false }));
    // Update the contentEditable div directly
    const row = document.getElementById(`row-${key}`);
    if (row) {
      const editableDiv = row.querySelector('.arabic-side .segment-text');
      if (editableDiv) editableDiv.textContent = text;
    }
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
            <button className="sidebar-btn" onClick={handleGeneratePDF}>
              Generate PDF
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
                        </div>
                        {openSuggestions[segmentId] && (
                          <div className="suggestions-panel" onClick={(e) => e.stopPropagation()}>
                            {suggestionsLoading && !suggestions[segmentId] ? (
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
                            onClick={(e) => { e.stopPropagation(); setFocusChatSegment({ pageIndex, blockIndex, id: segmentId }); }}
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