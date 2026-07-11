import React, { useState, useEffect } from 'react';
import {useLocation } from 'react-router-dom';
import '../assets/compare_interface.css';
import { API_URL } from '../apiConfig';
import FocusChatPanel from './FocusChatPanel';
import { trackNavigation, trackEvent } from '../analytics';
import { trackApiError } from '../errorTracking';
import { formatStyleGuideToXML, hasStyleGuideData } from '../utils/formatStyleGuideToXML';
import GeneralChat from './GeneralChat';
import {
  createDocument,
  getActiveDocumentId,
  loadDocument,
  saveDocumentState,
  setActiveDocumentId,
} from '../utils/indexedDbPersistence';

const CompareInterface = () => {
  const location = useLocation();
  const [activeSegment, setActiveSegment] = useState(null);
  const [translatedContents, setTranslatedContents] = useState(null);
  const [originalFile, setOriginalFile] = useState(null);
  const [originalFileName, setOriginalFileName] = useState(null);
  const [sourceLang, setSourceLang] = useState('English');
  const [targetLang, setTargetLang] = useState('Arabic');
  const [fileType, setFileType] = useState(null); // Track whether original was PDF or XLIFF
  const [checkedBlocks, setCheckedBlocks] = useState({});
  const [openSuggestions, setOpenSuggestions] = useState({}); // keyed by "pageIndex-blockIndex" -> boolean
  const [suggestions, setSuggestions] = useState({});
  const [suggestionsLoading, setSuggestionsLoading] = useState({}); // keyed by "pageIndex-blockIndex"
  const [openBackTranslations, setOpenBackTranslations] = useState({}); // keyed by "pageIndex-blockIndex" -> boolean
  const [backTranslations, setBackTranslations] = useState({});
  const [backTranslationLoading, setBackTranslationLoading] = useState({}); // keyed by "pageIndex-blockIndex"
  const [openExplanations, setOpenExplanations] = useState({}); // keyed by "pageIndex-blockIndex" -> boolean
  const [explanations, setExplanations] = useState({});
  const [explanationLoading, setExplanationLoading] = useState({}); // keyed by "pageIndex-blockIndex"
  const [focusChatSegment, setFocusChatSegment] = useState(null); // "pageIndex-blockIndex" or null
  const [copiedSegment, setCopiedSegment] = useState(null); // Track which segment was copied
  const [documentId, setDocumentId] = useState(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  // NEW: review suggestions state
  const [reviewSuggestions, setReviewSuggestions] = useState({});
  const [reviewLoading, setReviewLoading] = useState(false);
  // NEW: track which segment is currently being processed during review
  
  const [reviewingSegmentId, setReviewingSegmentId] = useState(null);
  const [reviewResults, setReviewResults] = useState(null);
  const [chatSuggestions, setChatSuggestions] = useState({});


  // const API_URL = 'https://cosmoid-francis-barbarously.ngrok-free.dev';
  // const API_URL = 'http://localhost:8000';

  const getActiveStyleGuideQueryValue = () => {
    try {
      const savedStyleGuide = sessionStorage.getItem('translation_style_guide');
      const savedIsActive = sessionStorage.getItem('translation_style_guide_active');
      const isActive = savedIsActive ? JSON.parse(savedIsActive) : false;

      if (!isActive || !savedStyleGuide) {
        return '';
      }

      const parsedStyleGuide = JSON.parse(savedStyleGuide);
      if (!hasStyleGuideData(parsedStyleGuide)) {
        return '';
      }

      const styleGuideXML = formatStyleGuideToXML(parsedStyleGuide);
      return styleGuideXML ? encodeURIComponent(styleGuideXML) : '';
    } catch (error) {
      console.warn('Failed to prepare style guide for segment endpoints:', error);
      return '';
    }
  };


  useEffect(() => {
    // Track navigation to compare interface
    trackNavigation('compare', 'translation_completed');
  }, []);

  useEffect(() => {   
    let cancelled = false;

    const hydrateDocument = async () => {
      try {
        const stateDocId = location.state?.documentId || null;
        let resolvedDocumentId = stateDocId || await getActiveDocumentId();
        let documentRecord = resolvedDocumentId ? await loadDocument(resolvedDocumentId) : null;

        if (!documentRecord && location.state?.translatedContents) {
          resolvedDocumentId = await createDocument({
            translatedContents: location.state.translatedContents,
            originalFile: location.state.originalFile || null,
            sourceLang: location.state.sourceLang || 'English',
            targetLang: location.state.targetLang || 'Arabic',
            fileType: location.state.fileType || null,
            fileName: location.state.fileName || null,
          });
          documentRecord = await loadDocument(resolvedDocumentId);
        }

        if (!documentRecord || cancelled) {
          if (!cancelled) {
            setIsHydrated(true);
          }
          return;
        }

        await setActiveDocumentId(documentRecord.id);

        setDocumentId(documentRecord.id);
        setTranslatedContents(documentRecord.translatedContents || null);
        setOriginalFile(documentRecord.originalFile || null);
        setOriginalFileName(documentRecord.fileName || null);
        setSourceLang(documentRecord.sourceLang || 'English');
        setTargetLang(documentRecord.targetLang || 'Arabic');
        setFileType(documentRecord.fileType || null);
        setCheckedBlocks(documentRecord.checkedBlocks || {});
        setSuggestions(documentRecord.suggestions || {});
        setBackTranslations(documentRecord.backTranslations || {});
        setExplanations(documentRecord.explanations || {});
        // NEW: load persisted review suggestions
        setReviewSuggestions(documentRecord.reviewSuggestions || {});
        // load chat suggestions
        setChatSuggestions(documentRecord.chatSuggestions || {});
      } catch (e) {
        console.error('Failed to hydrate compare document from IndexedDB:', e);
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    };

    hydrateDocument();

    return () => {
      cancelled = true;
    };
  }, [location.state]);

  useEffect(() => {
    if (!isHydrated || !documentId || !translatedContents) return;
    saveDocumentState(documentId, { translatedContents }).catch((e) => {
      console.error('Failed to persist translated contents:', e);
    });
  }, [documentId, isHydrated, translatedContents]);

  useEffect(() => {
    if (!isHydrated || !documentId) return;
    saveDocumentState(documentId, { checkedBlocks }).catch((e) => {
      console.error('Failed to persist checked blocks:', e);
    });
  }, [checkedBlocks, documentId, isHydrated]);

  useEffect(() => {
    if (!isHydrated || !documentId) return;
    saveDocumentState(documentId, { explanations }).catch((e) => {
      console.error('Failed to persist explanations:', e);
    });
  }, [documentId, explanations, isHydrated]);

  useEffect(() => {
    if (!isHydrated || !documentId) return;
    saveDocumentState(documentId, { backTranslations }).catch((e) => {
      console.error('Failed to persist back-translations:', e);
    });
  }, [backTranslations, documentId, isHydrated]);

  useEffect(() => {
    if (!isHydrated || !documentId) return;
    saveDocumentState(documentId, { suggestions }).catch((e) => {
      console.error('Failed to persist suggestions:', e);
    });
  }, [documentId, isHydrated, suggestions]);

  // NEW: persist review suggestions
  useEffect(() => {
    if (!isHydrated || !documentId) return;
    saveDocumentState(documentId, { reviewSuggestions }).catch((e) => {
      console.error('Failed to persist review suggestions:', e);
    });
  }, [reviewSuggestions, documentId, isHydrated]);

  useEffect(() => {
   if (!isHydrated || !documentId) return;
   saveDocumentState(documentId, { chatSuggestions }).catch((e) => {
     console.error('Failed to persist chat suggestions:', e);
   });
 }, [chatSuggestions, documentId, isHydrated]);

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
  //         original_file: originalFile
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
  //         originalFile: originalFile
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
      console.log(translatedContents)
      const requestBody = {
        translated_contents: translatedContents,
        source_lang: sourceLang,
        target_lang: targetLang,
      };
      
      // Only include original_xliff if the file was originally an XLIFF
      if (fileType === 'xliff' && originalFile) {
        requestBody.original_xliff = originalFile;
      }
      // If fileType is 'pdf', original_xliff will be undefined/null, 
      // triggering build_xliff_from_scratch on the backend
      
      const response = await fetch(`${API_URL}/generation/xliff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error('فشل إنشاء ملف XLIFF');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Generate dynamic download filename
      if (originalFileName) {
        var ext = originalFileName.split('.').pop().toLowerCase();
        if (ext === "pdf" || ext === "docx")
        {
          ext = 'xliff'
        }
        const baseName = originalFileName.replace(/\.[^/.]+$/, '');
        a.download = `${baseName}_translated.${ext}`;
      } else {
        a.download = 'translation_translated.xliff';
      }
      
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Track XLIFF generation
      trackEvent('xliff_generated', {
        total_segments: totalSegments,
        checked_segments: checkedCount,
        source_lang: sourceLang,
        target_lang: targetLang,
        file_type_original: fileType,
      });

    } catch (error) {
      console.error('Error generating XLIFF:', error);
      alert('حدث خطأ أثناء إنشاء ملف XLIFF');
      
      // Track XLIFF generation error
      trackApiError(error, {
        endpoint: '/generation/xliff',
        method: 'POST',
        action: 'Generating XLIFF file',
        context: {
          total_segments: totalSegments,
          source_lang: sourceLang,
          target_lang: targetLang,
          file_type_original: fileType,
        }
      });
    }
  };

  const handleGenerateDocx = async () => {
    try {
      const requestBody = {
        translated_contents: translatedContents.map(page =>
          page.map(block => ({
            original_text: block.original_text,
            translated_text: block.translated_text,
            type: block.type || null,
            info: block.info || null,
          }))
        ),
      };

      const response = await fetch(`${API_URL}/generation/docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) throw new Error('فشل إنشاء ملف Word');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      if (originalFileName) {
        const baseName = originalFileName.replace(/\.[^/.]+$/, '');
        a.download = `${baseName}_translated.docx`;
      } else {
        a.download = 'translation_translated.docx';
      }

      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);

      trackEvent('docx_generated', {
        total_segments: totalSegments,
        checked_segments: checkedCount,
        source_lang: sourceLang,
        target_lang: targetLang,
        file_type_original: fileType,
      });

    } catch (error) {
      console.error('Error generating DOCX:', error);
      alert('حدث خطأ أثناء إنشاء ملف Word');
      trackApiError(error, {
        endpoint: '/generation/docx',
        method: 'POST',
        action: 'Generating DOCX file',
        context: { total_segments: totalSegments, source_lang: sourceLang, target_lang: targetLang, file_type_original: fileType }
      });
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
      trackApiError(error, {
        endpoint: '/segment/backtranslation',
        method: 'POST',
        action: 'Fetching back-translation for segment',
        context: {
          page_index: pageIndex,
          block_index: blockIndex,
          segment_id: key,
        }
      });
      setBackTranslations(prev => ({ ...prev, [key]: '__ERROR__' }));
    } finally {
      setBackTranslationLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleCheckboxChange = (pageIndex, blockIndex) => {
    const key = `${pageIndex}-${blockIndex}`;
    setCheckedBlocks(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      // Persisting state is handled by IndexedDB save effects.
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
      trackApiError(error, {
        endpoint: '/segment/explanation',
        method: 'POST',
        action: 'Fetching explanation for segment',
        context: {
          page_index: pageIndex,
          block_index: blockIndex,
          segment_id: key,
        }
      });
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
      const styleGuideQueryValue = getActiveStyleGuideQueryValue();
      const suggestionsEndpoint = styleGuideQueryValue
        ? `${API_URL}/segment/suggestions?style_guide=${styleGuideQueryValue}`
        : `${API_URL}/segment/suggestions`;

      const response = await fetch(suggestionsEndpoint, {
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
      trackApiError(error, {
        endpoint: '/segment/suggestions',
        method: 'POST',
        action: 'Fetching AI suggestions for segment',
        context: {
          page_index: pageIndex,
          block_index: blockIndex,
          segment_id: key,
          source_lang: sourceLang,
          target_lang: targetLang,
        }
      });
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

  if (!isHydrated) {
    return (
      <div className="comparison-container">
        <div className="top-bar">
          <div className="top-bar-content">
            <span className="logo">ترجمان</span>
          </div>
        </div>
        <div className="comparison-content-wrapper">
          <div className="document-area">
            <div className="document-container">
              <div className="suggestions-loading" style={{ marginTop: '2rem' }}>
                Loading saved translation...
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Scan `text` starting from `from`, extract every complete top-level JSON object,
  // dispatch it to state immediately, and return the index of the last processed character.
  const extractAndApplySegments = (text, from, applyFn) => {
    let depth = 0;
    let inString = false;
    let escape = false;
    let objectStart = -1;
    let lastProcessed = from;

    for (let i = from; i < text.length; i++) {
      const ch = text[i];
      if (escape)             { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true;  continue; }
      if (ch === '"')         { inString = !inString; continue; }
      if (inString)           { continue; }

      if (ch === '{') {
        if (depth === 0) objectStart = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && objectStart !== -1) {
          try {
            const item = JSON.parse(text.slice(objectStart, i + 1));
            applyFn(item);
          } catch { /* object not yet complete — skip */ }
          lastProcessed = i + 1;
          objectStart = -1;
        }
      }
    }
    return lastProcessed;
  };

  // handle document review
  const handleReviewDocument = async () => {
    if (!translatedContents) {
      alert('No translated content to review.');
      return;
    }
    setReviewLoading(true);
    // Clear any previous highlight
    setReviewingSegmentId(null);
    setReviewSuggestions({});

    try {
      const response = await fetch(`${API_URL}/document/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          translated_contents: translatedContents,
          source_lang: sourceLang,
          target_lang: targetLang,
        }),
      });
      if (!response.ok) throw new Error('Review failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let scanFrom = 0;
      const reviewResultsLocal = {};


      // Called each time a complete segment object is extracted from the stream.
        const applySegment = (item) => {
        const key = item.id;
        if (!key) return;
        setReviewingSegmentId(key);
        const suggestion = item.revised_translation || item.suggestion || '';
        const note = item.notes || item.note || '';
        setReviewSuggestions(prev => ({
          ...prev,
          [key]: { suggestion, note, dismissed: false, applied: false },
        }));
        reviewResultsLocal[key] = { suggestion, note };
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop();

        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.type === 'token') {
              fullText += parsed.content;
            } else if (parsed.type === 'error') {
              console.error('Review SSE error:', parsed.content);
            }
          } catch { /* skip malformed SSE lines */ }
        }

        // After each chunk, try to flush any newly completed segment objects.
        scanFrom = extractAndApplySegments(fullText, scanFrom, applySegment);
      }

      // Final pass — catches any trailing object not followed by a newline.
      extractAndApplySegments(fullText, scanFrom, applySegment);

      const results = translatedContents.flatMap((page, pi) =>
        page.map((block, bi) => {
          const key = `${pi}-${bi}`;
          const r = reviewResultsLocal[key];
          if (!r) return null;
          return {
            id: key,
            source: block.original_text,
            original_translation: block.translated_text,
            revised_translation: r.suggestion,
            note: r.note,
            changed: r.suggestion !== block.translated_text,
          };
        }).filter(Boolean)
      );
      setReviewResults(results);

    } catch (error) {
      console.error('Review error:', error);
      alert('Failed to review document. Please check the console or try again.');
    } finally {
      setReviewLoading(false);
      // Remove highlight when done
      setReviewingSegmentId(null);
    }
  };

  const handleSegmentEdit = (pageIndex, blockIndex, newText) => {
    handleArabicEdit(pageIndex, blockIndex, newText);
    
    const key = `${pageIndex}-${blockIndex}`;
    const row = document.getElementById(`row-${key}`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('highlight-flash');
      setTimeout(() => row.classList.remove('highlight-flash'), 2000);
    }
  };

 const handleChatSuggestion = (segmentId, suggestion, note = '') => {
   setChatSuggestions(prev => ({
     ...prev,
     [segmentId]: { suggestion, note, dismissed: false, applied: false }
   }));
 };

  

  return (
    <div className="comparison-container">
      <div className="top-bar">
        <div className="top-bar-content">
          <span className="logo">تُرجمان</span>
          <div className="button-group">
            {/* <button className="sidebar-btn" onClick={handleGeneratePDF}>
              Generate PDF
            </button> */}
            <button className="sidebar-btn" onClick={handleGenerateXLIFF}>
              Generate XLIFF
            </button>
            <button className="sidebar-btn" onClick={handleGenerateDocx}>
              Generate DOCX
            </button>
            <span className="progress-badge">
              ✓ {checkedCount} / {totalSegments}
            </span>
          </div>
        </div>
      </div>
      
      <div className="comparison-content-wrapper">
         {/* Chat comes first in DOM → appears on the right */}
          <GeneralChat
          documentId={documentId}
          translatedContents={translatedContents.map(page => page.map(block => ({
                                                                        original_text: block.original_text,
                                                                        translated_text: block.translated_text
                                                                      })))}
          sourceLang={sourceLang}
          targetLang={targetLang}
          styleGuideQueryValue={getActiveStyleGuideQueryValue()}
          reviewResults={reviewResults}
          onSegmentEdit={handleSegmentEdit}
          onChatSuggestion={handleChatSuggestion}
          onReviewDocument={handleReviewDocument}
          reviewLoading={reviewLoading}
        />

        <div className="document-area">
          <div className={`document-container ${anyBtOpen ? 'bt-expanded' : ''}`}>
            <div className="comparison-table-header">
              <div className="header-spacer"></div>              
              <h2 className="column-header">النص الإنجليزي</h2>
              <h2 className="column-header">الترجمة العربية</h2>
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
                      className={`segment-row ${activeSegment === segmentId ? 'active-row' : ''} ${openBackTranslations[segmentId] ? 'bt-open' : ''} ${reviewingSegmentId === segmentId ? 'reviewing-row' : ''}`}
                      onClick={() => handleSegmentClick(pageIndex, blockIndex)}
                    >
                      <div className="segment-id-column">
                        <span className="seg-num">{segmentCounter}</span>
                        <input
                          type="checkbox"
                          className="seg-checkbox"
                          title="Mark as reviewed"
                          checked={!!checkedBlocks[segmentId]}
                          onChange={e => {
                            e.stopPropagation();
                            handleCheckboxChange(pageIndex, blockIndex);
                          }}
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
                        {/* <button
                          className={`segment-action-btn backtranslation-btn ${openBackTranslations[segmentId] ? 'active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleFetchBackTranslation(pageIndex, blockIndex); }}
                        >
                          🔄 ترجمة عكسية
                        </button> */}
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
                              <div className="suggestions-loading">‫قيد التحميل...</div>
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
                        {/* NEW: Revision suggestion banner — only shown when the reviewer left a note */}
                        {reviewSuggestions[segmentId]?.note && !reviewSuggestions[segmentId].dismissed && !reviewSuggestions[segmentId].applied && (
                          <div className="revision-banner" onClick={(e) => e.stopPropagation()}>
                            <div className="revision-banner-content">
                              <div className="revision-suggestion-text">{reviewSuggestions[segmentId].suggestion}</div>
                              <div className="revision-actions">
                                <button
                                  className="revision-apply-btn"
                                  onClick={() => {
                                    handleArabicEdit(pageIndex, blockIndex, reviewSuggestions[segmentId].suggestion);
                                    setReviewSuggestions(prev => ({
                                      ...prev,
                                      [segmentId]: { ...prev[segmentId], applied: true }
                                    }));
                                  }}
                                >
                                  ✓ Apply
                                </button>
                                <button
                                  className="revision-dismiss-btn"
                                  onClick={() => {
                                    setReviewSuggestions(prev => ({
                                      ...prev,
                                      [segmentId]: { ...prev[segmentId], dismissed: true }
                                    }));
                                  }}
                                >
                                  ✗ Dismiss
                                </button>
                                {/* <button
                                  className="revision-chat-btn"
                                  onClick={() => {
                                    trackEvent('focus_chat_opened', {
                                      segment_id: segmentId,
                                      source: 'revision_banner',
                                    });
                                    setFocusChatSegment({ pageIndex, blockIndex, id: segmentId });
                                  }}
                                >
                                  💬 Chat about revision
                                </button> */}
                              </div>
                            </div>
                          </div>
                        )}
                        {/* Chat suggestion banner */}
                       {chatSuggestions[segmentId] && !chatSuggestions[segmentId].dismissed && !chatSuggestions[segmentId].applied && (
                         <div className="revision-banner" onClick={(e) => e.stopPropagation()}>
                           <div className="revision-banner-content">
                             <div className="revision-suggestion-text">{chatSuggestions[segmentId].suggestion}</div>
                             <div className="revision-actions">
                               <button
                                 className="revision-apply-btn"
                                 onClick={() => {
                                  handleArabicEdit(pageIndex, blockIndex, chatSuggestions[segmentId].suggestion);
                                   setChatSuggestions(prev => ({
                                     ...prev,
                                     [segmentId]: { ...prev[segmentId], applied: true }
                                   }));
                                 }}
                               >
                                 ✓ Apply
                               </button>
                               <button
                                 className="revision-dismiss-btn"
                                 onClick={() => {
                                   setChatSuggestions(prev => ({
                                     ...prev,
                                     [segmentId]: { ...prev[segmentId], dismissed: true }
                                   }));
                                 }}
                               >
                                 ✗ Dismiss
                               </button>
                             </div>
                           </div>
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
                            💬 Segment Chat
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
          documentId={documentId}
          segment={translatedContents[focusChatSegment.pageIndex][focusChatSegment.blockIndex]}
          segmentId={focusChatSegment.id}
          pageContext={translatedContents[focusChatSegment.pageIndex].map(b => b.original_text)}
          docContext={translatedContents.map(page => page.map(block => block.original_text))}
          sourceLang={sourceLang}
          targetLang={targetLang}
          styleGuideQueryValue={getActiveStyleGuideQueryValue()}
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