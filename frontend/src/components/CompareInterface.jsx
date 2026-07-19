import React, { useState, useEffect, useMemo } from 'react';
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

// Helper to get exact cursor position in contentEditable
const getCaretCharacterOffsetWithin = (element) => {
  let caretOffset = 0;
  const doc = element.ownerDocument || element.document;
  const win = doc.defaultView || doc.parentWindow;
  if (typeof win.getSelection !== "undefined") {
    const sel = win.getSelection();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(element);
      preCaretRange.setEnd(range.endContainer, range.endOffset);
      caretOffset = preCaretRange.toString().length;
    }
  }
  return caretOffset;
};

// Helper to shift state keys down when a segment is split
const shiftStateKeys = (stateObj, pageIndex, splitIndex, pageLength) => {
  if (!stateObj) return stateObj;
  const newState = { ...stateObj };
  // Shift backwards from the bottom to the split point to avoid overwriting
  for (let i = pageLength - 1; i > splitIndex; i--) {
    const oldKey = `${pageIndex}-${i}`;
    const newKey = `${pageIndex}-${i + 1}`;
    if (newState.hasOwnProperty(oldKey)) {
      newState[newKey] = newState[oldKey];
      delete newState[oldKey];
    }
  }
  // Clear data for the newly split block to avoid ghost data
  delete newState[`${pageIndex}-${splitIndex}`];
  delete newState[`${pageIndex}-${splitIndex + 1}`];
  return newState;
};

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
  const [suggestions, setSuggestions] = useState({});
  const [suggestionsLoading, setSuggestionsLoading] = useState({}); // keyed by "pageIndex-blockIndex"
  const [openBackTranslations, setOpenBackTranslations] = useState({}); // keyed by "pageIndex-blockIndex" -> boolean
  const [backTranslations, setBackTranslations] = useState({});
  const [backTranslationLoading, setBackTranslationLoading] = useState({}); // keyed by "pageIndex-blockIndex"
  const [explanations, setExplanations] = useState({});
  const [explanationLoading, setExplanationLoading] = useState({}); // keyed by "pageIndex-blockIndex"
  const [focusChatSegment, setFocusChatSegment] = useState(null); // "pageIndex-blockIndex" or null
  const [copiedSegment, setCopiedSegment] = useState(null); // Track which segment was copied
  const [documentId, setDocumentId] = useState(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [glossary, setGlossary] = useState(null);
  const [glossaryId, setGlossaryId] = useState(null);
  const [tmId, setTmId] = useState(null);
  // NEW: review suggestions state
  const [reviewSuggestions, setReviewSuggestions] = useState({});
  const [reviewLoading, setReviewLoading] = useState(false);
  // NEW: track which segment is currently being processed during review
  
  const [reviewingSegmentId, setReviewingSegmentId] = useState(null);
  const [reviewResults, setReviewResults] = useState(null);
  const [chatSuggestions, setChatSuggestions] = useState({});
  const [showShortcuts, setShowShortcuts] = useState(false);
  // NEW: which tab is showing in the segment detail panel (matches | termbase | explain | suggestions)
  const [activeTab, setActiveTab] = useState('matches');
  // --- NEW: Pending Reviews Tracking & Navigation ---
  const [currentReviewIndex, setCurrentReviewIndex] = useState(-1);


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
    if (!isHydrated || !documentId) return;
    saveDocumentState(documentId, { glossaryId, tmId }).catch((e) => {
      console.error('Failed to persist glossaryId:', e);
    });
  }, [glossaryId, tmId, documentId, isHydrated]);

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
              glossaryId: location.state.glossaryId || null,
              tmId: location.state.tmId || null,
          });
          documentRecord = await loadDocument(resolvedDocumentId);
        }

        if (!documentRecord || cancelled) {
          if (!cancelled) {
            setIsHydrated(true);
          }
          return;
        }
        
        console.log('Hydrated document:', {
  glossaryId: documentRecord.glossaryId,
  glossaryFileName: documentRecord.glossaryFileName,
});

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
        setGlossaryId(documentRecord.glossaryId || null);
        setTmId(documentRecord.tmId || null);
        if (documentRecord.glossaryId) {
          fetch(`${API_URL}/translation/glossary/${documentRecord.glossaryId}`)
            .then(async (res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data && !cancelled) setGlossary(data.terms);
              console.log("glossary: ", data.terms);
            })
            .catch((e) => console.warn('Failed to load glossary:', e));
        }
      } catch (e) {
        console.error('Failed to hydrate compare document from IndexedDB:', e);
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    };

    console.log("glossary: ", glossary);

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

  useEffect(() => {
    if (!showShortcuts) return;
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.shortcuts-wrapper')) {
        setShowShortcuts(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [showShortcuts]);

  // Lazily fetch explanation / suggestions when the corresponding tab is opened for a segment
  useEffect(() => {
    if (!activeSegment || !translatedContents) return;
    const [pi, bi] = activeSegment.split('-').map(Number);
    if (activeTab === 'explain') {
      ensureExplanation(pi, bi);
    } else if (activeTab === 'suggestions') {
      ensureSuggestions(pi, bi, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSegment, activeTab]);

  const pendingReviewIds = useMemo(() => {
    const ids = [];
    if (!translatedContents) return ids;
    
    translatedContents.forEach((page, pi) => {
      page.forEach((_, bi) => {
        const id = `${pi}-${bi}`;
        // Must match the exact conditions used to render the revision banners below:
        // the review banner only shows when a note is present, so only count it then.
        const hasReview = reviewSuggestions[id] && !!reviewSuggestions[id].note && !reviewSuggestions[id].applied && !reviewSuggestions[id].dismissed;
        const hasChat = chatSuggestions[id] && !chatSuggestions[id].applied && !chatSuggestions[id].dismissed;
        if (hasReview || hasChat) ids.push(id);
      });
    });
    return ids;
  }, [translatedContents, reviewSuggestions, chatSuggestions]);

  const navigateToSuggestion = (direction) => {
    if (pendingReviewIds.length === 0) return;
    
    let nextIndex;
    if (direction === 'next') {
      nextIndex = (currentReviewIndex + 1) % pendingReviewIds.length;
    } else {
      nextIndex = (currentReviewIndex - 1 + pendingReviewIds.length) % pendingReviewIds.length;
    }
    
    setCurrentReviewIndex(nextIndex);
    const targetId = pendingReviewIds[nextIndex];
    
    const row = document.getElementById(`row-${targetId}`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Optional: Add a brief highlight effect
      row.style.transition = 'background-color 0.3s ease';
      row.style.backgroundColor = '#fff3cd'; // Yellow flash
      setTimeout(() => {
        row.style.backgroundColor = '';
      }, 1500);
    }
  };

  const handleBatchApply = () => {
    setTranslatedContents(prevContents => {
      const newContents = JSON.parse(JSON.stringify(prevContents));
      pendingReviewIds.forEach(id => {
        const [pi, bi] = id.split('-').map(Number);
        const rev = reviewSuggestions[id];
        const chat = chatSuggestions[id];
        
        if (rev && !rev.applied && !rev.dismissed) {
          newContents[pi][bi].translated_text = rev.suggestion;
        } else if (chat && !chat.applied && !chat.dismissed) {
          newContents[pi][bi].translated_text = chat.suggestion;
        }
      });
      return newContents;
    });

    setReviewSuggestions(prev => {
      const updated = { ...prev };
      pendingReviewIds.forEach(id => {
        if (updated[id]) updated[id].applied = true;
      });
      return updated;
    });

    setChatSuggestions(prev => {
      const updated = { ...prev };
      pendingReviewIds.forEach(id => {
        if (updated[id]) updated[id].applied = true;
      });
      return updated;
    });
  };

  const handleBatchDismiss = () => {
    setReviewSuggestions(prev => {
      const updated = { ...prev };
      pendingReviewIds.forEach(id => {
        if (updated[id]) updated[id].dismissed = true;
      });
      return updated;
    });

    setChatSuggestions(prev => {
      const updated = { ...prev };
      pendingReviewIds.forEach(id => {
        if (updated[id]) updated[id].dismissed = true;
      });
      return updated;
    });
  };

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

  // Split a segment into two parts based strictly on cursor position in the SOURCE text
  const handleSplitSegment = (pageIndex, blockIndex, sourceCaretOffset) => {
    // Validate that we have a valid split point before mutating state
    const block = translatedContents[pageIndex][blockIndex];
    const srcTextForValidation = block.original_text || '';

    if (typeof sourceCaretOffset !== 'number' || sourceCaretOffset <= 0 || sourceCaretOffset >= srcTextForValidation.length) {
      alert("يرجى وضع المؤشر في المكان المراد التقسيم عنده داخل النص الإنجليزي (المصدر).");
      return;
    }

    setTranslatedContents(prevContents => {
      const newContents = JSON.parse(JSON.stringify(prevContents));
      const page = newContents[pageIndex];
      const currentBlock = page[blockIndex];

      const srcText = currentBlock.original_text || '';
      const currentTgtText = currentBlock.translated_text || '';

      const srcOffset = sourceCaretOffset;
      const ratio = srcOffset / srcText.length;
      let tgtOffset = Math.floor(currentTgtText.length * ratio);

      // Try to snap target offset to the nearest space for a cleaner cut
      const spaceIndex = currentTgtText.indexOf(' ', tgtOffset);
      if (spaceIndex !== -1 && Math.abs(spaceIndex - tgtOffset) < 15) {
        tgtOffset = spaceIndex + 1;
      }

      const src1 = srcText.substring(0, srcOffset).trim();
      const src2 = srcText.substring(srcOffset).trim();
      const tgt1 = currentTgtText.substring(0, tgtOffset).trim();
      const tgt2 = currentTgtText.substring(tgtOffset).trim();

      const block1 = { ...currentBlock, original_text: src1, translated_text: tgt1 };
      const block2 = { ...currentBlock, original_text: src2, translated_text: tgt2,};

      // Replace 1 block with 2 blocks
      page.splice(blockIndex, 1, block1, block2);

      const pageLen = prevContents[pageIndex].length;

      // Shift all state object keys down by 1
      setCheckedBlocks(prev => shiftStateKeys(prev, pageIndex, blockIndex, pageLen));
      setSuggestions(prev => shiftStateKeys(prev, pageIndex, blockIndex, pageLen));
      setSuggestionsLoading(prev => shiftStateKeys(prev, pageIndex, blockIndex, pageLen));
      setBackTranslations(prev => shiftStateKeys(prev, pageIndex, blockIndex, pageLen));
      setExplanations(prev => shiftStateKeys(prev, pageIndex, blockIndex, pageLen));
      setReviewSuggestions(prev => shiftStateKeys(prev, pageIndex, blockIndex, pageLen));
      setChatSuggestions(prev => shiftStateKeys(prev, pageIndex, blockIndex, pageLen));
      setOpenBackTranslations(prev => shiftStateKeys(prev, pageIndex, blockIndex, pageLen));
      console.log(translatedContents);
      return newContents;
    });

    // Auto-focus the second half after splitting
    setTimeout(() => {
      const newId = `${pageIndex}-${blockIndex + 1}`;
      setActiveSegment(newId);
      const row = document.getElementById(`row-${newId}`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const editable = row.querySelector('.arabic-side .segment-text');
        if (editable) {
          editable.focus();
        }
      }
    }, 100);
  };

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
    setOpenBackTranslations(prev => ({ ...prev, [key]: false }));
  };

  // Copy source text into the target (Arabic) side
  const handleCopySourceToTarget = (pageIndex, blockIndex) => {
    const block = translatedContents[pageIndex][blockIndex];
    const sourceText = block.original_text || '';
    handleArabicEdit(pageIndex, blockIndex, sourceText);
    const segmentId = `${pageIndex}-${blockIndex}`;
    const editableDiv = document.querySelector(`#row-${segmentId} .arabic-side .segment-text`);
    if (editableDiv) editableDiv.textContent = sourceText;
    trackEvent('copy_source_to_target', { page_index: pageIndex, block_index: blockIndex });
  };

  // Move focus + caret to the next segment's Arabic editable field
  const focusNextSegment = (pageIndex, blockIndex) => {
    const flatIds = [];
    translatedContents.forEach((page, pi) => page.forEach((_, bi) => flatIds.push(`${pi}-${bi}`)));
    const currentId = `${pageIndex}-${blockIndex}`;
    const nextId = flatIds[flatIds.indexOf(currentId) + 1];
    if (!nextId) return;

    const row = document.getElementById(`row-${nextId}`);
    const nextEl = row ? row.querySelector('.arabic-side .segment-text') : null;
    if (!row || !nextEl) return;

    setActiveSegment(nextId);
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nextEl.focus();
    const range = document.createRange();
    range.selectNodeContents(nextEl);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };

  // Keyboard shortcuts inside the Arabic contentEditable field
  const handleSegmentKeyDown = (e, pageIndex, blockIndex) => {
    const segmentId = `${pageIndex}-${blockIndex}`;
    const isCmd = e.ctrlKey || e.metaKey;

    // Splitting must be done with the cursor placed in the source (English) text,
    // not the translation — so Ctrl/Cmd+S is handled on the source side instead (see handleSourceKeyDown).

    // Ctrl/Cmd + Enter: confirm segment and jump to the next one
    if (isCmd && !e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      handleArabicEdit(pageIndex, blockIndex, e.currentTarget.textContent);
      if (!checkedBlocks[segmentId]) {
        handleCheckboxChange(pageIndex, blockIndex);
      }
      focusNextSegment(pageIndex, blockIndex);
      return;
    }
    
    // Ctrl/Cmd + Shift + S: copy source to target
    if (isCmd && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      handleCopySourceToTarget(pageIndex, blockIndex);
      return;
    }
    
    // Escape: leave the field and clear focus state
    if (e.key === 'Escape') {
      e.preventDefault();
      e.currentTarget.blur();
      setActiveSegment(null);
    }
  };

  // Keyboard handling for the source (English) field. The source text is focusable so the
  // cursor can be placed inside it, but it is not editable — only Ctrl/Cmd+S (split) and
  // navigation/selection keys are allowed through.
  const handleSourceKeyDown = (e, pageIndex, blockIndex) => {
    const isCmd = e.ctrlKey || e.metaKey;

    // Ctrl/Cmd + s: Split Segment — cursor must be in the source text
    if (isCmd && (e.key === 'S' || e.key === 's')) {
      e.preventDefault();
      const sourceOffset = getCaretCharacterOffsetWithin(e.currentTarget);
      const textLen = e.currentTarget.textContent.length;

      if (sourceOffset <= 0 || sourceOffset >= textLen) {
        alert("يرجى وضع المؤشر في المكان المراد التقسيم عنده داخل النص الإنجليزي (المصدر).");
        return;
      }

      handleSplitSegment(pageIndex, blockIndex, sourceOffset);
      return;
    }

    const allowedKeys = [
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'Home', 'End', 'PageUp', 'PageDown', 'Tab', 'Escape'
    ];
    const isCopy = isCmd && (e.key === 'c' || e.key === 'C' || e.key === 'a' || e.key === 'A');

    if (e.key === 'Escape') {
      e.preventDefault();
      e.currentTarget.blur();
      return;
    }

    // Block any other keystroke — the source text is read-only, it's only focusable
    // so the cursor can be placed inside it for splitting.
    if (!allowedKeys.includes(e.key) && !isCopy) {
      e.preventDefault();
    }
  };

  // Fetches an explanation for a segment if it isn't already cached (called from the Explain tab)
  const ensureExplanation = async (pageIndex, blockIndex, forceRetry = false) => {
    const key = `${pageIndex}-${blockIndex}`;
    if (!forceRetry && explanations[key] && explanations[key] !== '__ERROR__') return;
    if (explanationLoading[key]) return;

    if (explanations[key] === '__ERROR__') {
      setExplanations(prev => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });
    }
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

  // Fetches AI suggestions for a segment if not already cached (called from the Suggestions tab)
  const ensureSuggestions = async (pageIndex, blockIndex, forceRetry = false) => {
    const key = `${pageIndex}-${blockIndex}`;
    if (!forceRetry && suggestions[key] && suggestions[key] !== '__ERROR__') return;
    if (suggestionsLoading[key]) return;

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

  // Simple, local QA pass — no backend call, runs whenever content changes
  const qaIssues = useMemo(() => {
    if (!translatedContents) return {};
    const issues = {};
    translatedContents.forEach((page, pageIndex) => {
      page.forEach((block, blockIndex) => {
        const key = `${pageIndex}-${blockIndex}`;
        const src = (block.original_text || '').trim();
        const tgt = (block.translated_text || '').trim();
        const flags = [];

        if (src && !tgt) {
          flags.push('لم تتم الترجمة');
        } else if (src && tgt && src === tgt) {
          flags.push('النص المصدر منسوخ دون ترجمة');
        }
        if (/ {2,}/.test(tgt)) flags.push('مسافات مزدوجة');
        if (/,/.test(tgt)) flags.push('فاصلة إنجليزية بدل "،"');
        if (src && tgt && /[?？]\s*$/.test(src) && !/[؟?]\s*$/.test(tgt)) {
          flags.push('علامة استفهام مفقودة');
        }

        if (flags.length) issues[key] = flags;
      });
    });
    return issues;
  }, [translatedContents]);

  const totalWords = translatedContents
    ? translatedContents.flat().reduce(
        (sum, b) => sum + (b.original_text || '').trim().split(/\s+/).filter(Boolean).length,
        0
      )
    : 0;
  const progressPercent = totalSegments ? Math.round((checkedCount / totalSegments) * 100) : 0;

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
          pendingReviewCount={pendingReviewIds.length}
          onBatchApply={handleBatchApply}
          onBatchDismiss={handleBatchDismiss}
          onNavigateSuggestion={navigateToSuggestion}
          glossary={glossary}
          tmId={tmId}
          activeSegmentSource={(() => {
            if (!activeSegment || !translatedContents) return '';
            const [pi, bi] = activeSegment.split('-').map(Number);
            return translatedContents[pi]?.[bi]?.original_text || '';
          })()}
        />

        <div className="document-area">
          <div className={`document-container ${anyBtOpen ? 'bt-expanded' : ''}`}>
            <div className="comparison-table-header">
              <div className="header-spacer"></div>              
              <h2 className="column-header">النص الإنجليزي</h2>
              <div className="header-spacer"></div> {/* <-- NEW MIDDLE SPACER */}
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
                  const isActive = activeSegment === segmentId;
                  return (
                    <div
                      key={segmentId}
                      id={`row-${segmentId}`}
                      className={`segment-card-wrapper ${isActive ? 'active-card' : ''} ${checkedBlocks[segmentId] ? 'segment-confirmed' : ''}`}
                    >
                      <div
                        className={`segment-row ${isActive ? 'active-row' : ''} ${openBackTranslations[segmentId] ? 'bt-open' : ''} ${reviewingSegmentId === segmentId ? 'reviewing-row' : ''}`}
                        onClick={() => handleSegmentClick(pageIndex, blockIndex)}
                      >
                        <div className="segment-id-column">
                          <span className="seg-num">{segmentCounter}</span>
                          <input
                            type="checkbox"
                            className="seg-checkbox"
                            title="Mark as reviewed (Ctrl + Enter)"
                            checked={!!checkedBlocks[segmentId]}
                            onChange={e => {
                              e.stopPropagation();
                              handleCheckboxChange(pageIndex, blockIndex);
                            }}
                          />
                          {/* NEW SPLIT BUTTON */}
                          <button
                            className="split-segment-btn"
                            onMouseDown={(e) => e.preventDefault()} // Prevents the contentEditable from losing focus & cursor position
                            onClick={(e) => {
                              e.stopPropagation();
                              const row = document.getElementById(`row-${segmentId}`);
                              if (row) {
                                const sourceDiv = row.querySelector('.english-side .segment-text');
                                if (sourceDiv) {
                                  const caretOffset = getCaretCharacterOffsetWithin(sourceDiv);
                                  const textLen = sourceDiv.textContent.length;

                                  // Validate that a cursor place was actually specified in the SOURCE text
                                  if (caretOffset <= 0 || caretOffset >= textLen) {
                                    alert("يرجى وضع المؤشر في المكان المراد التقسيم عنده داخل النص الإنجليزي (المصدر).");
                                    return;
                                  }

                                  handleSplitSegment(pageIndex, blockIndex, caretOffset);
                                }
                              }
                            }}
                            title="تقسيم الجملة عند المؤشر — ضع المؤشر داخل النص الإنجليزي (Ctrl+S)"

                          >
                            ⇌
                          </button>
                          {qaIssues[segmentId] && (
                            <span
                              className="qa-badge"
                              title={qaIssues[segmentId].join(' • ')}
                              onClick={(e) => e.stopPropagation()}
                            >
                              ⚠
                            </span>
                          )}
                        </div>

                        <div className="segment english-side">
                          <div className="english-side-inner">
                            <div
                              className="segment-text"
                              contentEditable
                              suppressContentEditableWarning
                              onClick={() => handleSegmentClick(pageIndex, blockIndex)}
                              onBeforeInput={(e) => e.preventDefault()}
                              onKeyDown={(e) => {
                                    if (e.key === 'Backspace' || e.key === 'Delete') {
                                      e.preventDefault();
                                    }
                                  }}
                              onPaste={(e) => e.preventDefault()}
                              onDrop={(e) => e.preventDefault()}
                              onCut={(e) => e.preventDefault()}
                            >
                              {block.original_text || ''}
                            </div>
                          </div>
                        </div>

                        {/* This is now an active grid track (32px wide) holding the button */}
                        <div className="segment-middle-actions">
                          <button
                            className="copy-btn copy-source-btn"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => { e.stopPropagation(); handleCopySourceToTarget(pageIndex, blockIndex); }}
                            title="نسخ المصدر إلى الترجمة (Ctrl+I)"
                          >
                            ⧉
                          </button>
                        </div>

                        <div className="segment arabic-side">
                          <div className="arabic-side-inner">
                            <div
                              className="segment-text"
                              contentEditable={true}
                              suppressContentEditableWarning
                              onBlur={(e) => handleArabicEdit(pageIndex, blockIndex, e.currentTarget.textContent)}
                              onClick={() => handleSegmentClick(pageIndex, blockIndex)}
                              onKeyDown={(e) => handleSegmentKeyDown(e, pageIndex, blockIndex)}
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
                          
                          {/* Backtranslation box moved here to utilize the full width of the Arabic column */}
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
                        </div>
                      </div>

                      {/* Matecat-style detail panel: only rendered for the currently active segment */}
                      {isActive && (
                        <div className="segment-detail-panel" onClick={(e) => e.stopPropagation()}>
                          <div className="detail-tabs">
                            {/* <button
                              className={`detail-tab-btn ${activeTab === 'matches' ? 'active' : ''}`}
                              onClick={() => setActiveTab(activeTab === 'matches' ? null : 'matches')}
                            >
                              مطابقات الترجمة
                            </button>
                            <button
                              className={`detail-tab-btn ${activeTab === 'termbase' ? 'active' : ''}`}
                              onClick={() => setActiveTab(activeTab === 'termbase' ? null : 'termbase')}
                            >
                              قاعدة المصطلحات
                            </button> */}
                            <button
                              className={`detail-tab-btn ${activeTab === 'explain' ? 'active' : ''}`}
                              onClick={() => setActiveTab(activeTab === 'explain' ? null : 'explain')}
                            >
                              📖 شرح
                            </button>
                            <button
                              className={`detail-tab-btn ${activeTab === 'suggestions' ? 'active' : ''}`}
                              onClick={() => setActiveTab(activeTab === 'suggestions' ? null : 'suggestions')}
                            >
                              💡 اقتراحات
                            </button>
                            {/* <button
                              className="detail-tab-btn segment-chat-btn"
                              onClick={() => setFocusChatSegment({ pageIndex, blockIndex, id: segmentId })}
                              title="فتح محادثة مخصصة لهذه الجملة بجانب محادثة المستند"
                            >
                              💬 محادثة الجملة
                            </button> */}
                          </div>

                          {activeTab && (
                            <div className="detail-tab-content">
                              {activeTab === 'matches' && (
                                <div className="tab-empty-state">لا توجد مطابقات من ذاكرة الترجمة لهذه الجملة بعد.</div>
                              )}

                              {activeTab === 'termbase' && (
                                <div className="tab-empty-state">لم يتم العثور على مصطلحات من قاعدة المصطلحات لهذه الجملة.</div>
                              )}

                              {activeTab === 'explain' && (
                                explanationLoading[segmentId] ? (
                                  <div className="explanation-loading">جاري تحميل الشرح...</div>
                                ) : explanations[segmentId] === '__ERROR__' ? (
                                  <div className="explanation-error">
                                    ⚠️ حدث خطأ أثناء التحميل.
                                    <button className="retry-btn" onClick={() => ensureExplanation(pageIndex, blockIndex, true)}>إعادة المحاولة</button>
                                  </div>
                                ) : explanations[segmentId] ? (
                                  <div
                                    className="explanation-text"
                                    dangerouslySetInnerHTML={{
                                      __html: explanations[segmentId]?.replace(/\n/g, '<br />'),
                                    }}
                                  ></div>
                                ) : (
                                  <div className="tab-empty-state">لا يوجد شرح متاح بعد.</div>
                                )
                              )}

                              {activeTab === 'suggestions' && (
                                suggestionsLoading[segmentId] ? (
                                  <div className="suggestions-loading">جاري تحميل الاقتراحات...</div>
                                ) : suggestions[segmentId] === '__ERROR__' ? (
                                  <div className="explanation-error">
                                    ⚠️ حدث خطأ أثناء التحميل.
                                    <button className="retry-btn" onClick={() => ensureSuggestions(pageIndex, blockIndex, true)}>إعادة المحاولة</button>
                                  </div>
                                ) : suggestions[segmentId]?.length ? (
                                  suggestions[segmentId].map((s, i) => (
                                    <div className="suggestion-card" key={i}>
                                      <div className="suggestion-card-meta">
                                        <span className="suggestion-model-label">{s.model}</span>
                                      </div>
                                      <div className="suggestion-card-text">{s.text}</div>
                                      <button
                                        className="suggestion-apply-btn"
                                        onClick={() => handleApplySuggestion(pageIndex, blockIndex, s.text)}
                                      >
                                        ✓
                                      </button>
                                    </div>
                                  ))
                                ) : (
                                  <div className="tab-empty-state">لا توجد اقتراحات بعد.</div>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="bottom-status-bar">
            <div className="status-bar-inner">
              <div className="status-progress-track">
                <div className="status-progress-fill" style={{ width: `${progressPercent}%` }}></div>
              </div>
              <span className="status-item status-percent">{progressPercent}%</span>
              <span className="status-item">✓ {checkedCount} / {totalSegments} جملة مؤكدة</span>
              <span className="status-item">📝 {totalWords} كلمة</span>
              <div className="shortcuts-wrapper">
                <button
                  type="button"
                  className="status-item shortcuts-hint"
                  onClick={(e) => { e.stopPropagation(); setShowShortcuts(prev => !prev); }}
                >
                  ⌨ اختصارات
                </button>
                {showShortcuts && (
                  <div className="shortcuts-popover" onClick={(e) => e.stopPropagation()}>
                    <div className="shortcuts-popover-row"><kbd>Ctrl</kbd> + <kbd>Enter</kbd><span>تأكيد والانتقال للجملة التالية</span></div>
                    <div className="shortcuts-popover-row"><kbd>Ctrl</kbd> + <kbd>S</kbd><span>تقسيم الجملة عند المؤشر</span></div>
                    <div className="shortcuts-popover-row"><kbd>Ctrl</kbd> + <kbd>I</kbd><span>نسخ المصدر إلى الترجمة</span></div>
                    <div className="shortcuts-popover-row"><kbd>Esc</kbd><span>الخروج من الحقل</span></div>
                  </div>
                )}
              </div>
            </div>
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