// Torgman.jsx
import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../assets/Torgman.css';
import { API_URL } from '../apiConfig';
import StyleGuidePanel from './StyleGuidePanel';
import { formatStyleGuideToXML, hasStyleGuideData } from '../utils/formatStyleGuideToXML';
import {
  trackFileSelected,
  trackTranslationStarted,
  trackTranslationCompleted,
  trackTranslationError,
} from '../analytics';
import { trackNetworkError } from '../errorTracking';
import {
  clearAllPersistence,
  createDocument,
  getActiveDocumentId,
  loadDocument,
} from '../utils/indexedDbPersistence';

// day month year ->  ٢٠٢٦/١/١٦
// day is read from the right
// tags: new improved fixed
// new -> جديد | improved -> تحسين | fixed -> إصلاح 
const WHATS_NEW_ITEMS = [
  {
    
    date: '٢٠٢٦/٥/٢١',
    tag: 'جديد',
    tagType: 'new',
    text:'يمكنك الآن رفع ملف مصطلحات لاستخدامه أثناء الترجمة.',
  },
  {
    date: '٢٠٢٦/٤/١٦',
    tag: 'تحسين',
    tagType: 'improved',
    text: 'أصبح تُرجمان يعمل بسلاسة على الهاتف، بحيث يمكنك ترجمة النصوص و تعديل الترجمات مباشرةً بسهولة.',
  },
  {
    date: '٢٠٢٦/٤/١٥',
    tag: 'جديد',
    tagType: 'new',
    text: 'دليل أسلوب جديد أصبح معتمدًا الآن، مما يحسّن جودة الترجمة ويؤثر على الاقتراحات والمحادثات.',
  },
  {
    date: '٢٠٢٦/٤/١٣',
    tag: 'تحسين',
    tagType: 'improved',
    text: 'عملك يُحفظ تلقائيًا. أغلق الصفحة و أكمل لاحقًا',
  },
  
];

const SAMPLE_PDF_NAME = 'tax.pdf';
const SAMPLE_PDF_URL = `${import.meta.env.BASE_URL}static/${SAMPLE_PDF_NAME}`;


const Torgman = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [glossaryFile, setGlossaryFile] = useState(null);
  const [glossaryFileName, setGlossaryFileName] = useState('');
  const [glossaryFileSize, setGlossaryFileSize] = useState(null);
  const [status, setStatus] = useState('');
  const [downloadUrl, setDownloadUrl] = useState(''); 
  const [translatedContents, setTranslatedContents] = useState(null);
  const [fileContent, setFileContent] = useState(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [sourceLang, setSourceLang] = useState('English');
  const [targetLang, setTargetLang] = useState('Arabic');
  const [progress, setProgress] = useState(0); // NEW
  const [totalBlocks, setTotalBlocks] = useState(0); // NEW
  const [translationStartTime, setTranslationStartTime] = useState(null);
  const [isStyleGuideOpen, setIsStyleGuideOpen] = useState(false);
  const [styleGuideData, setStyleGuideData] = useState({});
  const [isStyleGuideActive, setIsStyleGuideActive] = useState(false);
  const [activeDocumentId, setActiveDocumentId] = useState(null);
  const [isWhatsNewOpen, setIsWhatsNewOpen] = useState(true);
  const [isPreparingSample, setIsPreparingSample] = useState(false);
  const fileInputRef = useRef();
  const glossaryInputRef = useRef();
  const translateBtnRef = useRef(); // Added to bring visibility to translate button
  // ── CHANGED: two new refs for cancellation ─────────────────────────────────
  const abortControllerRef = useRef(null);   // holds the AbortController for the active fetch
  const translationIdRef = useRef(null);     // holds a unique ID for the active translation run
  // ───────────────────────────────────────────────────────────────────────────
  const navigate = useNavigate();

  useEffect(() => {
    if (fileName && translateBtnRef.current) {
      translateBtnRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [fileName]);
  // Load latest translated document from IndexedDB on component mount
  useEffect(() => {
    let cancelled = false;

    const hydrateLatestDocument = async () => {
      let hasDbGlossary = false;
      try {
        const documentId = await getActiveDocumentId();
        if (!documentId) return;

        const savedDocument = await loadDocument(documentId);
        if (!savedDocument || !savedDocument.translatedContents) return;

        hasDbGlossary = Boolean(savedDocument.glossaryFileName);

        if (!cancelled) {
          setSelectedFile(null);
          setActiveDocumentId(documentId);
          setTranslatedContents(savedDocument.translatedContents);
          setFileContent(savedDocument.originalFile || null);
          setSourceLang(savedDocument.sourceLang || 'English');
          setTargetLang(savedDocument.targetLang || 'Arabic');
          setFileName(savedDocument.fileName || '');
          setGlossaryFileName(savedDocument.glossaryFileName || '');
          setGlossaryFileSize(savedDocument.glossaryFileSize || null);
          setDownloadUrl('indexeddb');
          setIsTranslating(false);
          setIsPreparingSample(false);
          setProgress(0);
          setTotalBlocks(0);
          setTranslationStartTime(null);
          setStatus('‫تمت الترجمة بنجاح!');
        }
      } catch (e) {
        console.error('Failed to load translation data from IndexedDB:', e);
      }

      if (!cancelled && !hasDbGlossary) {
        const savedGlossaryName = sessionStorage.getItem('translation_glossary_name') || '';
        const savedGlossarySize = sessionStorage.getItem('translation_glossary_size');
        if (savedGlossaryName) {
          setGlossaryFileName(savedGlossaryName);
          setGlossaryFileSize(savedGlossarySize ? Number(savedGlossarySize) : null);
        }
      }
    };

    hydrateLatestDocument();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load style guide from session storage on component mount
  useEffect(() => {
    const savedStyleGuide = sessionStorage.getItem('translation_style_guide');
    const savedStyleGuideActive = sessionStorage.getItem('translation_style_guide_active');
    
    if (savedStyleGuide) {
      try {
        const parsedData = JSON.parse(savedStyleGuide);
        setStyleGuideData(parsedData);
        console.log('%c=== LOADED STYLE GUIDE FROM SESSION STORAGE ===', 'color: #1D9E75; font-weight: bold; font-size: 14px;');
        console.log('Data:', parsedData);
      } catch (e) {
        console.error('Failed to parse saved style guide:', e);
      }
    }
    
    if (savedStyleGuideActive) {
      setIsStyleGuideActive(JSON.parse(savedStyleGuideActive));
    }
  }, []);
  // const API_URL = 'https://cosmoid-francis-barbarously.ngrok-free.dev';
  // const API_URL = 'http://localhost:8000';

  const Sourcelanguages = [
    { code: 'en', name: 'English', englishName: 'English' },
  ];

  const Targetlanguages = [
    { code: 'ar', name: 'العربية', englishName: 'Arabic' },
    { code: 'ar_eg', name: 'العربية المصرية', englishName: 'Egyptian Arabic' },
    { code: 'ar_sa', name: 'العربية السعودية', englishName: 'Saudi Arabic' },
  ];



  const getFileType = (fileName) => {
    const ext = fileName.toLowerCase().split('.').pop();
    if (ext === 'pdf') return 'pdf';
    if (ext === 'xliff' || ext === 'xlf' || ext === 'sdlxliff' || ext === 'mqxliff') return 'xliff';
    if (ext === 'docx') return 'docx';
    return null;
  };

  const isTbxFile = (name) => name?.toLowerCase().endsWith('.tbx');

  // Cleanup legacy sessionStorage keys from the pre-IndexedDB flow.
  const clearLegacySessionStorage = () => {
    const keysToDelete = [
      'translationData',
      'compare_translatedContents',
      'compare_checked_blocks',
      'compare_suggestions',
      'compare_backTranslations',
      'compare_explanations',
      'last_nav_key',
    ];

    keysToDelete.forEach((key) => sessionStorage.removeItem(key));

    const chatKeysToDelete = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('chat_history_')) {
        chatKeysToDelete.push(key);
      }
    }
    chatKeysToDelete.forEach((key) => sessionStorage.removeItem(key));
  };

  // ── CHANGED: cancelTranslation helper ──────────────────────────────────────
  // Aborts any in-flight fetch and invalidates the current translation run ID
  // so that stale async callbacks cannot update state after cancellation.
  // Call this before every user action that discards the current translation.
  const cancelTranslation = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    translationIdRef.current = null;
  };
  // ───────────────────────────────────────────────────────────────────────────

  const resetTranslationUiState = () => {
    // ── CHANGED: abort any in-flight request before resetting UI ───────────
    cancelTranslation();
    // ───────────────────────────────────────────────────────────────────────
    setDownloadUrl('');
    setTranslatedContents(null);
    setFileContent(null);
    setStatus('');
    setActiveDocumentId(null);
    setIsTranslating(false);
    setIsPreparingSample(false);
    setProgress(0);
    setTotalBlocks(0);
    setTranslationStartTime(null);
  };

  const applySelectedFile = (file) => {
    if (!file) return false;

    const fileType = getFileType(file.name);
    if (!fileType) {
      alert('نوع الملف غير مدعوم. يرجى اختيار ملف PDF أو XLIFF أو DOCX');
      return false;
    }

    resetTranslationUiState();
    setSelectedFile(file);
    setFileName(file.name);

    trackFileSelected(fileType, file.size, file.name);
    return true;
  };

  const applyGlossaryFile = (file) => {
    if (!file) return false;

    if (!isTbxFile(file.name)) {
      alert('نوع ملف المسرد غير مدعوم. يرجى اختيار ملف TBX');
      return false;
    }

    setGlossaryFile(file);
    setGlossaryFileName(file.name);
    setGlossaryFileSize(file.size || null);
    sessionStorage.setItem('translation_glossary_name', file.name);
    if (file.size) {
      sessionStorage.setItem('translation_glossary_size', String(file.size));
    } else {
      sessionStorage.removeItem('translation_glossary_size');
    }
    return true;
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    const isValidSelection = applySelectedFile(file);
    if (!isValidSelection && fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGlossaryChange = (e) => {
    const file = e.target.files[0];
    const isValidSelection = applyGlossaryFile(file);
    if (!isValidSelection && glossaryInputRef.current) {
      glossaryInputRef.current.value = '';
    }
  };

  const handleTrySamplePdf = async () => {
    if (isPreparingSample || (isTranslating && !downloadUrl)) return;

    setIsPreparingSample(true);
    setStatus('جارٍ تجهيز ملف العينة...');
    

    try {
      const response = await fetch(SAMPLE_PDF_URL);
      if (!response.ok) {
        throw new Error(`Failed to load sample PDF: ${response.status}`);
      }

      const sampleBlob = await response.blob();
      const samplePdfFile = new File([sampleBlob], SAMPLE_PDF_NAME, {
        type: sampleBlob.type || 'application/pdf',
      });

      applySelectedFile(samplePdfFile);
    } catch (error) {
      console.error('Failed to load sample PDF:', error);
      setStatus('تعذر تجهيز ملف العينة. حاول مرة أخرى.');
    } finally {
      setIsPreparingSample(false);
    }
  };

  const handleTranslateFile = async () => {
    if (!selectedFile) {
      alert('الرجاء اختيار ملف أولاً');
      return;
    }

    const fileType = getFileType(selectedFile.name);
    if (!fileType) {
      alert('نوع الملف غير مدعوم');
      return;
    }

    // ── CHANGED: create a unique ID for this run and an AbortController ────
    // If the user cancels mid-translation, translationIdRef.current is set to
    // null (in cancelTranslation). Every async checkpoint below compares its
    // captured thisId against translationIdRef.current; a mismatch means the
    // run was superseded and we return early without touching state.
    const thisId = crypto.randomUUID();
    translationIdRef.current = thisId;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Convenience: returns true when this run has been cancelled or replaced.
    const isCancelled = () => translationIdRef.current !== thisId;
    // ───────────────────────────────────────────────────────────────────────

    setIsTranslating(true);
    setStatus('‫قيد المعالجة...');
    setProgress(0);
    setTotalBlocks(0);
    const translationStartTs = Date.now();
    setTranslationStartTime(translationStartTs);
    let translationPhase = 'preparing_request';
    let sseParseErrorTracked = false;
    let latestProgressCompleted = 0;
    let latestTotalBlocks = 0;
    const getProgressPercent = () => {
      if (!latestTotalBlocks || latestTotalBlocks <= 0) return 0;
      return Math.min(100, Math.max(0, Math.round((latestProgressCompleted / latestTotalBlocks) * 100)));
    };

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (glossaryFile) {
        formData.append('glossary', glossaryFile);
      }

      // Determine endpoint and source language code
      const endpoints = {
              'pdf': '/translation/pdf',
              'docx': '/translation/docx',
              'xliff': '/translation/xliff'
            };
      const endpoint = endpoints[fileType];
      const sourceLangObj = Sourcelanguages.find(lang => lang.englishName === sourceLang);
      const targetLangObj = Targetlanguages.find(lang => lang.englishName === targetLang);
      const sourceLangCode = sourceLangObj?.code || 'en';
      const targetLangCode = targetLangObj?.code || 'ar';

      // Build query params including style guide if present and active
      let queryParams = `source_lang=${sourceLangCode}&target_lang=${targetLangCode}`;
      if (hasStyleGuideData(styleGuideData) && isStyleGuideActive) {
        const styleGuideXML = formatStyleGuideToXML(styleGuideData);
        const encodedStyleGuide = encodeURIComponent(styleGuideXML);
        queryParams += `&style_guide=${encodedStyleGuide}`;
        
        // Log style guide being sent
        console.log('%c=== SENDING STYLE GUIDE TO BACKEND ===', 'color: #1D9E75; font-weight: bold; font-size: 14px;');
        console.log('XML:', styleGuideXML);
        console.log('URL-encoded param:', `style_guide=${encodedStyleGuide}`);
      } else if (hasStyleGuideData(styleGuideData) && !isStyleGuideActive) {
        console.log('%c=== STYLE GUIDE SAVED BUT DEACTIVATED - NOT SENDING TO BACKEND ===', 'color: #FF9500; font-weight: bold; font-size: 14px;');
      }

      // Track translation start
      trackTranslationStarted(fileType, selectedFile.size, sourceLang, targetLang);
      translationPhase = 'uploading_file';
      const response = await fetch(
        `${API_URL}${endpoint}?${queryParams}`,
        {
          method: 'POST',
          body: formData,
          // ── CHANGED: pass abort signal so the fetch is cancelled instantly ─
          signal: controller.signal,
          // ───────────────────────────────────────────────────────────────────
        }
      );

      if (!response.ok) {
        // Try to get detailed error from backend
        let errorDetail = 'فشلت عملية الترجمة على الخادم';
        try {
          const errorData = await response.json();
          errorDetail = errorData.detail || errorData.message || errorDetail;
        } catch {
          // If response is not JSON, just use status text
          errorDetail = `${response.status} ${response.statusText}`;
        }
        const error = new Error(errorDetail);
        error.status = response.status;
        error.statusText = response.statusText;
        error.phase = 'http_response_error';
        throw error;
      }

      // Read the SSE stream
      translationPhase = 'reading_stream';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalData = null;

      const processLines = (lines) => {
        for (const line of lines) {
          // ── CHANGED: stop processing lines if this run was cancelled ───────
          if (isCancelled()) return;
          // ───────────────────────────────────────────────────────────────────
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            try {
              const event = JSON.parse(jsonStr);
              if (event.type === 'progress') {
                translationPhase = 'translating_blocks';
                latestProgressCompleted = event.completed;
                latestTotalBlocks = event.total;
                setProgress(event.completed);
                setTotalBlocks(event.total);
                setStatus(`‫قيد الترجمة... ${event.completed}/${event.total}`);
              } else if (event.type === 'done') {
                translationPhase = 'finalizing_result';
                finalData = event;
              }
            } catch (e) {
              console.error('Failed to parse SSE event:', e);
              if (!sseParseErrorTracked) {
                sseParseErrorTracked = true;
                trackTranslationError(e, {
                  file_name: selectedFile?.name,
                  file_size: selectedFile?.size,
                  source_lang: sourceLang,
                  target_lang: targetLang,
                  endpoint: endpoint,
                  translation_phase: 'sse_parse',
                  elapsed_ms: Date.now() - translationStartTs,
                  progress_percent: getProgressPercent(),
                  sse_line_preview: trimmed.substring(0, 300),
                });
              }
            }
          }
        }
      };

      while (true) {
        // ── CHANGED: bail out of the read loop if this run was cancelled ─────
        if (isCancelled()) break;
        // ───────────────────────────────────────────────────────────────────
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();
        processLines(lines);
      }

      // Process any remaining data left in the buffer after stream ends
      // ── CHANGED: skip if cancelled — we don't want to process a stale buffer
      if (!isCancelled() && buffer.trim()) {
        processLines(buffer.split('\n\n'));
      }
      // ───────────────────────────────────────────────────────────────────────

      // ── CHANGED: if cancelled at this point, return before touching any state
      if (isCancelled()) return;
      // ───────────────────────────────────────────────────────────────────────

      if (!finalData) {
        translationPhase = 'missing_final_event';
        throw new Error('لم يتم استلام نتيجة الترجمة');
      }

      // Handle file-specific logic
      let newFileContent = null;
      
      if (fileType === 'pdf') {
        translationPhase = 'building_pdf_output';
        // PDF response includes base64 encoded PDF
        const blob = new Blob(
          [Uint8Array.from(atob(finalData.pdf), c => c.charCodeAt(0))],
          { type: 'application/pdf' }
        );
        const url = URL.createObjectURL(blob);
        setTranslatedContents(finalData.translated_contents);
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
          };
          reader.onerror = reject;
          reader.readAsDataURL(selectedFile);
        });
        newFileContent = base64;
        setFileContent(base64);
        setDownloadUrl(url);
      } else if (fileType === 'xliff' || fileType == "docx") {
        translationPhase = 'building_xliff_output';
        // XLIFF response includes XLIFF XML string
        const blob = new Blob([finalData.xliff], { type: 'application/xliff+xml' });
        const url = URL.createObjectURL(blob);
        setTranslatedContents(finalData.translated_contents);
        newFileContent = finalData.xliff; // Store XLIFF content
        setFileContent(finalData.xliff);
        setDownloadUrl(url);
      }

      // Hard reset policy: each new upload replaces all previously persisted IndexedDB data.
      await clearAllPersistence();

      // ── CHANGED: check again after the async clearAllPersistence call ──────
      if (isCancelled()) return;
      // ───────────────────────────────────────────────────────────────────────

      const persistedDocumentId = await createDocument({
        translatedContents: finalData.translated_contents,
        originalFile: newFileContent,
        sourceLang: sourceLang,
        targetLang: targetLang,
        fileType: fileType,
        fileName: fileName,
        glossaryFileName: glossaryFileName,
        glossaryFileSize: glossaryFileSize,
      });

      // ── CHANGED: final guard before writing results to UI ──────────────────
      if (isCancelled()) return;
      // ───────────────────────────────────────────────────────────────────────

      setActiveDocumentId(persistedDocumentId);

      // Remove old sessionStorage artifacts so restore behavior is deterministic.
      clearLegacySessionStorage();

      // Track translation completion
      const translationDuration = Date.now() - translationStartTs;
      trackTranslationCompleted(fileType, selectedFile.size, translationDuration, true);

      setStatus('‫تمت الترجمة بنجاح!');
    } catch (error) {
      // ── CHANGED: AbortError means the user cancelled — not a real error ────
      // Don't show an error message or update any state; just return cleanly.
      if (error.name === 'AbortError') return;
      // ───────────────────────────────────────────────────────────────────────

      console.error("Translation Error:", error);
      const elapsedMs = Date.now() - translationStartTs;
      const errorMessageLower = String(error?.message || '').toLowerCase();
      const isTimeoutError = errorMessageLower.includes('request timeout');
      const isStreamNetworkError = error instanceof TypeError && (
        errorMessageLower.includes('network error') ||
        errorMessageLower.includes('failed to fetch') ||
        errorMessageLower.includes('load failed')
      );
      
      // Track the error to PostHog
      if (isTimeoutError) {
        trackNetworkError(error, {
          errorType: 'timeout',
          endpoint: fileType === 'pdf' ? '/translation/pdf' : '/translation/xliff',
          timeout: 30000,
          context: {
            file_name: selectedFile?.name,
            file_size: selectedFile?.size,
            source_lang: sourceLang,
            target_lang: targetLang,
            translation_phase: translationPhase,
            elapsed_ms: elapsedMs,
            progress_percent: getProgressPercent(),
          }
        });
      } else if (isStreamNetworkError) {
        trackNetworkError(error, {
          errorType: 'stream_interrupted',
          endpoint: fileType === 'pdf' ? '/translation/pdf' : '/translation/xliff',
          timeout: 30000,
          context: {
            file_name: selectedFile?.name,
            file_size: selectedFile?.size,
            source_lang: sourceLang,
            target_lang: targetLang,
            translation_phase: translationPhase,
            elapsed_ms: elapsedMs,
            progress_percent: getProgressPercent(),
            browser_stream_error_message: error?.message || null,
          },
        });
      } else {
        trackTranslationError(error, {
          file_name: selectedFile?.name,
          file_size: selectedFile?.size,
          source_lang: sourceLang,
          target_lang: targetLang,
          endpoint: fileType === 'pdf' ? '/translation/pdf' : '/translation/xliff',
          translation_phase: translationPhase,
          elapsed_ms: elapsedMs,
          progress_percent: getProgressPercent(),
          http_status: error.status,
          status_text: error.statusText,
          error_message: error.message,
        });
      }
      
      setStatus('حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      // ── CHANGED: only clear the translating flag if this run wasn't cancelled
      // If it was cancelled, resetTranslationUiState already called setIsTranslating(false).
      if (!isCancelled()) {
        setIsTranslating(false);
      }
      // ───────────────────────────────────────────────────────────────────────
    }
  };

  const getEstimatedTime = () => {
    if (!translationStartTime || progress < 1) return '‫قيد التقدير...';
    const elapsed = (Date.now() - translationStartTime) / 1000; // seconds
    const avgPerBlock = elapsed / progress;
    const remaining = avgPerBlock * (totalBlocks - progress);
    if (remaining < 60) return `نحو ${Math.ceil(remaining)} ثانية متبقية`;
    const mins = Math.floor(remaining / 60);
    return `~${mins} minutes remaining`;
  };

  const handleStyleGuideConfirm = (data) => {
    setStyleGuideData(data);
    sessionStorage.setItem('translation_style_guide', JSON.stringify(data));
    sessionStorage.setItem('translation_style_guide_active', JSON.stringify(true));
    setIsStyleGuideActive(true);
    setIsStyleGuideOpen(false);
    
    // Log the style guide data and XML output
    console.log('%c=== STYLE GUIDE DATA ===', 'color: #1D9E75; font-weight: bold; font-size: 14px;');
    console.log('Form Data:', data);
    const styleGuideXML = formatStyleGuideToXML(data);
    console.log('%c=== STYLE GUIDE XML OUTPUT ===', 'color: #C15030; font-weight: bold; font-size: 14px;');
    console.log(styleGuideXML);
  };

  const handleStyleGuideToggle = () => {
    const newActiveState = !isStyleGuideActive;
    setIsStyleGuideActive(newActiveState);
    sessionStorage.setItem('translation_style_guide_active', JSON.stringify(newActiveState));
    
    console.log(`%c=== STYLE GUIDE ${newActiveState ? 'ACTIVATED' : 'DEACTIVATED'} ===`, 'color: #FF9500; font-weight: bold; font-size: 14px;');
  };

  const handleStyleGuideCancel = () => {
    setIsStyleGuideOpen(false);
  };


  return (
    <div className="torgman-page">
      <div className="top-bar">
        <div className="top-bar-content">
          <span className="logo">تُرجمان</span>
        </div>
      </div>

      <div className="container">
        {/* {isWhatsNewOpen && (
          <aside className="card whats-new-panel hero-whats-new-panel" aria-label="ما الجديد">
            <div className="whats-new-header">
              <h3 className="whats-new-title">ما الجديد</h3>
              <button
                type="button"
                className="whats-new-close"
                onClick={() => setIsWhatsNewOpen(false)}
                aria-label="إغلاق لوحة ما الجديد"
              >
                ✕
              </button>
            </div>

            <p className="whats-new-subtitle">آخر تحديثات تُرجمان</p>

            <ul className="whats-new-list whats-new-timeline">
              {WHATS_NEW_ITEMS.map((item, index) => (
                <li key={`${item.date}-${item.text}`} className="whats-new-item whats-new-timeline-item">
                  <div className="wn-timeline-col">
                    <span className={`wn-timeline-dot wn-dot-${item.tagType}`} />
                    {index < WHATS_NEW_ITEMS.length - 1 && (
                      <span className="wn-timeline-line" />
                    )}
                  </div>
                  <div className="wn-timeline-content">
                    <div className="wn-timeline-meta">
                      <span className={`wn-tag wn-tag-${item.tagType}`}>{item.tag}</span>
                      <span className="whats-new-date">{item.date}</span>
                    </div>
                    <span className="wn-timeline-text">{item.text}</span>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        )} */}

        <div className="main-grid">
        <div className="card">
        
          {/* Style Guide Toggle Button */}
           {/* <div className="style-guide-toggle">
            <button
              className={`btn-toggle-guide ${isStyleGuideOpen ? 'active' : ''} ${hasStyleGuideData(styleGuideData) && isStyleGuideActive ? 'has-data' : ''}`}
              onClick={() => setIsStyleGuideOpen(!isStyleGuideOpen)}
            >
              <span className="icon">⚙️</span>
              {hasStyleGuideData(styleGuideData) && isStyleGuideActive ? 'Using Style Guide ✓' : 'Add Style Guide (Optional)'}
            </button>
          </div> */}

          {/* Style Guide Panel - Conditionally Rendered */}
          {
          isStyleGuideOpen && (
            <StyleGuidePanel 
              onConfirm={handleStyleGuideConfirm}
              onCancel={handleStyleGuideCancel}
              initialData={styleGuideData}
              isActive={isStyleGuideActive}
              onToggleActive={hasStyleGuideData(styleGuideData) ? handleStyleGuideToggle : undefined}
            />
          )
          }
          
          {/* Language Selection */}
          <div className="language-selector">
            <div className="lang-group">
              <label className="lang-label">اللغة المستهدفة</label>
              <select 
                value={targetLang} 
                onChange={(e) => setTargetLang(e.target.value)}
                className="lang-select"
              >
                {Targetlanguages.map(lang => (
                  <option key={lang.code} value={lang.englishName}>
                    {lang.name} ({lang.englishName})
                  </option>
                ))}
              </select>
            </div>

            <div className="arrow-icon">←</div>

            <div className="lang-group">
              <label className="lang-label">اللغة المصدر</label>
              <select 
                value={sourceLang} 
                onChange={(e) => setSourceLang(e.target.value)}
                className="lang-select"
              >
                {Sourcelanguages.map(lang => (
                  <option key={lang.code} value={lang.englishName}>
                    {lang.name} ({lang.englishName})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="sample-file-action">
            <button
              type="button"
              className="sample-file-btn"
              onClick={handleTrySamplePdf}
              disabled={isPreparingSample || (isTranslating && !downloadUrl)}
            >
              {isPreparingSample ? 'جارٍ تجهيز ملف العينة...' : 'جرّب ملف‫ PDF'}
            </button>
          </div>

            {/* Combined Upload & File Information Component */}
          <div 
            className={`upload-area ${fileName ? 'has-file' : ''}`}
            onClick={() => !fileName && fileInputRef.current.click()}
          >
            {!fileName ? (
              <>
                <div className="upload-icon">📤</div>
                <div className="upload-text">اسحب وأفلت ملفاتك هنا</div>
                <div className="upload-hint">PDF, XLIFF, DOCX ‫(الحد الأقصى ‫10MB)</div>
              </>
            ) : (
              <div className="compact-file-info">
                <div className="file-meta-side">
                  <span className="file-icon-badge">📄</span>
                  <span className="compact-filename">{fileName}</span>
                </div>
                <button 
                  type="button"
                  className="compact-remove-btn" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setFileName('');
                    setSelectedFile(null);
                    setGlossaryFileName('');
                    setGlossaryFile(null);
                    resetTranslationUiState();
                    if (fileInputRef.current) fileInputRef.current.value = '';
                      if (glossaryInputRef.current) glossaryInputRef.current.value = '';

                  }}
                >
                  تغيير الملف ✕
                </button>
              </div>
            )}
          </div>
            <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
            accept=".pdf,.xliff,.xlf,.sdlxliff,.mqxliff,.docx"
          />

          <div className="glossary-upload">
                {!glossaryFileName ? (
                  <button
                    type="button"
                    className="glossary-upload-btn"
                    onClick={() => glossaryInputRef.current.click()}
                  >
                    أضف ملف مصطلحات (TBX)
                  </button>
                ) : (
                  <div className="glossary-chip">
                    <span className="glossary-chip-icon">📘</span>
                    <span className="glossary-chip-name" title={glossaryFileName}>
                      {glossaryFileName}
                    </span>
                    
                    <button
                      type="button"
                      className="glossary-chip-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        setGlossaryFileName('');
                        setGlossaryFile(null);
                        setGlossaryFileSize(null);
                        sessionStorage.removeItem('translation_glossary_name');
                        sessionStorage.removeItem('translation_glossary_size');
                        if (glossaryInputRef.current) {
                          glossaryInputRef.current.value = '';
                        }
                      }}
                      aria-label="إزالة ملف المصطلحات"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
          <input
            type="file"
            ref={glossaryInputRef}
            style={{ display: 'none' }}
            onChange={handleGlossaryChange}
            accept=".tbx"
          />

          {/* File Display */}
          {/* {fileName && (
            <div className="file-list-container">
              <div className="file-card">
                <span className="file-type-icon">📄</span>
                <div className="file-details">
                  <div className="file-name">{fileName}</div>
                  <div className="file-meta">
                    {selectedFile
                      ? `${(selectedFile.size / 1024).toFixed(1)} KB • جاهز للترجمة`
                      : 'ملف محفوظ من الجلسة السابقة'}
                  </div>
                </div>
                {/* ── CHANGED: cancelTranslation() added before state resets ── */}
                <button 
                  className="remove-file" 
                  onClick={() => {
                    cancelTranslation();
                    setFileName('');
                    setSelectedFile(null);
                    resetTranslationUiState();
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                >
                  ✕
                </button>
                {/* ──────────────────────────────────────────────────────────── */}
              </div>
            </div>
          )} */}

          {/* {glossaryFileName && (
            <div className="file-list-container">
              <div className="file-card">
                <span className="file-type-icon">📘</span>
                <div className="file-details">
                  <div className="file-name">{glossaryFileName}</div>
                  <div className="file-meta">
                    {glossaryFile
                      ? `${(glossaryFile.size / 1024).toFixed(1)} KB • جاهز للاستخدام`
                      : glossaryFileSize
                        ? `${(glossaryFileSize / 1024).toFixed(1)} KB • ملف مسرد محفوظ من الجلسة السابقة`
                        : 'ملف مسرد محفوظ من الجلسة السابقة'}
                  </div>
                </div>
                <button
                  className="remove-file"
                  onClick={() => {
                    setGlossaryFileName('');
                    setGlossaryFile(null);
                    setGlossaryFileSize(null);
                    sessionStorage.removeItem('translation_glossary_name');
                    sessionStorage.removeItem('translation_glossary_size');
                    if (glossaryInputRef.current) {
                      glossaryInputRef.current.value = '';
                    }
                  }}
                >
                  ✕
                </button>
              </div>
            </div>
          )} */}

          {/* Action Buttons */}
          <div className="action-area">
            {/* Progress Bar - NEW */}
            {isTranslating && totalBlocks > 0 && (
              <div className="progress-container">
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${(progress / totalBlocks) * 100}%` }}
                  />
                </div>
                <span className="progress-text">
                  {progress}/{totalBlocks} فقرة ({Math.round((progress / totalBlocks) * 100)}%)
                </span>
                <span className="progress-eta">
                  {getEstimatedTime()}
                </span>
              </div>
            )}
            {!downloadUrl ? (
              <button 
                className="translate-btn"
                onClick={handleTranslateFile}
                disabled={!selectedFile || isTranslating}
              >
                {isTranslating ? '‫قيد التحميل...' : 'ترجم المستندات'}
              </button>
            ) : (
              <div className="results-actions">
                {/* <a 
                  href={downloadUrl} 
                  download="translated_file.pdf" 
                  className="translate-btn download-btn"
                >
                  تحميل الملف
                </a> */}
                <button 
                  className="translate-btn edit-btn" 
                  onClick={() => {
                    // Track navigation to editing interface
                    // trackDocumentDownloaded('pdf');
                    navigate('/compare', { 
                      state: { 
                        documentId: activeDocumentId,
                        translatedContents: translatedContents,
                        originalFile: fileContent,
                        sourceLang: sourceLang,
                        targetLang: targetLang,
                        fileName: fileName,
                        fileType: getFileType(fileName)
                      }
                    });
                  }}
                >  
                  انتقل للتعديل
                </button>
              </div>
            )}
            {status && <p className="status-msg">{status}</p>}
          </div>
        </div>

      </div>
    </div>
  </div>
  );
};

export default Torgman;