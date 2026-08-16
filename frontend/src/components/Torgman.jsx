// Torgman.jsx
import React, { useRef, useState, useEffect, useCallback } from 'react';
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
  trackWrongFileUploaded,
} from '../analytics';
import { trackNetworkError } from '../errorTracking';
import {
  clearAllPersistence,
  clearActiveTranslationJob,
  createDocument,
  getActiveTranslationJob,
  getActiveDocumentId,
  loadDocument,
  setActiveTranslationJob,
  saveDocumentState,
  setPendingUpload,
  getPendingUpload,
  clearPendingUpload,
  fileToBase64,
} from '../utils/indexedDbPersistence';

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
  const [glossaryId, setGlossaryId] = useState(null);
  const [glossaryFileBase64, setGlossaryFileBase64] = useState(null);
  const [glossaryUploading, setGlossaryUploading] = useState(false);
  const [tmFile, setTmFile] = useState(null);
  const [tmFileName, setTmFileName] = useState('');
  const [tmFileSize, setTmFileSize] = useState(null);
  const [tmId, setTmId] = useState(null);
  const [tmFileBase64, setTmFileBase64] = useState(null);
  const [tmUploading, setTmUploading] = useState(false);
  const [status, setStatus] = useState('');
  const [downloadUrl, setDownloadUrl] = useState(''); 
  const [translatedContents, setTranslatedContents] = useState(null);
  const [fileContent, setFileContent] = useState(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [activeAction, setActiveAction] = useState(null); // 'translate' | 'segment' | null
  const [sourceLang, setSourceLang] = useState('English');
  const [targetLang, setTargetLang] = useState('Arabic');
  const [progress, setProgress] = useState(0);
  const [totalBlocks, setTotalBlocks] = useState(0);
  const [isStyleGuideOpen, setIsStyleGuideOpen] = useState(false);
  const [styleGuideData, setStyleGuideData] = useState({});
  const [isStyleGuideActive, setIsStyleGuideActive] = useState(false);
  const [activeDocumentId, setActiveDocumentId] = useState(null);
  const [isPreparingSample, setIsPreparingSample] = useState(false);
  const fileInputRef = useRef();
  const glossaryInputRef = useRef();
  const tmInputRef = useRef();
  const translateBtnRef = useRef();
  const etaStartTimeRef = useRef(null);
  const etaBaselineCompletedRef = useRef(null);
  const abortControllerRef = useRef(null);
  const translationIdRef = useRef(null);
  // Holds the in-flight upload promise so handleTranslateFile can await it —
  // closes the race where "Translate" is clicked before an async glossary/TM
  // upload (started on file selection) has finished and set glossaryId/tmId.
  const glossaryUploadPromiseRef = useRef(null);
  const tmUploadPromiseRef = useRef(null);
  // Always mirrors the latest glossary/TM attachment (id + cached file),
  // updated synchronously — unlike state, which a long-running async
  // function only sees as of when it started. Lets a translation job that's
  // already in flight pick up a glossary/TM uploaded *while it was running*
  // once the job finishes and the document gets created.
  const glossaryRef = useRef({ id: null, fileName: '', fileSize: null, base64: null });
  const tmRef = useRef({ id: null, fileName: '', fileSize: null, base64: null });
  // True once the user has explicitly uploaded or removed a glossary/TM
  // since the current translation started — lets us tell "user attached/
  // removed one mid-flight, respect that" apart from "nothing happened,
  // fall back to whatever the job itself used".
  const glossaryTouchedRef = useRef(false);
  const tmTouchedRef = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (fileName && translateBtnRef.current) {
      translateBtnRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [fileName]);

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

  const cancelTranslation = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    translationIdRef.current = null;
    void clearActiveTranslationJob();
  };

  const resetTranslationUiState = () => {
    cancelTranslation();
    etaStartTimeRef.current = null;
    etaBaselineCompletedRef.current = null;
    setDownloadUrl('');
    setTranslatedContents(null);
    setFileContent(null);
    setStatus('');
    setActiveDocumentId(null);
    setGlossaryId(null);
    setIsTranslating(false);
    setActiveAction(null);
    setIsPreparingSample(false);
    setProgress(0);
    setTotalBlocks(0);
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
    return true;
  };

  const applyTmFile = (file) => {
    if (!file) return false;

    const isValidTm = /\.(tmx|csv|xlsx)$/i.test(file.name);
    if (!isValidTm) {
      alert('نوع ملف ذاكرة الترجمة غير مدعوم. يرجى اختيار ملف TMX أو CSV أو XLSX');
      return false;
    }

    setTmFile(file);
    setTmFileName(file.name);
    setTmFileSize(file.size || null);
    return true;
  };

  // Uploads a TBX glossary immediately on selection so an id exists before
  // (or after) translation, and caches the file as base64 in IndexedDB so it
  // survives tab close and can be silently re-uploaded if the backend's
  // in-memory store ever expires or restarts. `existingDocumentId` is passed
  // when attaching a glossary to an already-translated document.
  const uploadGlossaryFile = async (file, existingDocumentId) => {
    if (!file) return;
    const uploadPromise = (async () => {
    setGlossaryUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const sourceLangObj = Sourcelanguages.find((l) => l.englishName === sourceLang);
      const targetLangObj = Targetlanguages.find((l) => l.englishName === targetLang);
      const src = sourceLangObj?.code || 'en';
      const tgt = targetLangObj?.code || 'ar';

      const formData = new FormData();
      formData.append('glossary', file);

      const res = await fetch(
        `${API_URL}/glossary?source_lang=${src}&target_lang=${tgt}`,
        { method: 'POST', body: formData }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Upload failed');
      }
      const data = await res.json();

      setGlossaryId(data.glossary_id);
      glossaryRef.current = { id: data.glossary_id, fileName: file.name, fileSize: file.size, base64 };
      glossaryTouchedRef.current = true;
      setGlossaryFileBase64(base64);
      await setPendingUpload('glossary', {
        id: data.glossary_id, fileName: file.name, fileSize: file.size, base64,
      });

      if (existingDocumentId) {
        await saveDocumentState(existingDocumentId, {
          glossaryFileName: file.name,
          glossaryFileSize: file.size || null,
          glossaryId: data.glossary_id,
          glossaryFileBase64: base64,
        });
      }
    } catch (e) {
      console.error('Glossary upload failed:', e);
      alert('فشل رفع ملف المصطلحات');
      setGlossaryFile(null);
      setGlossaryFileName('');
      setGlossaryFileSize(null);
      setGlossaryId(null);
      setGlossaryFileBase64(null);
      if (glossaryInputRef.current) glossaryInputRef.current.value = '';
    } finally {
      setGlossaryUploading(false);
    }
    })();
    glossaryUploadPromiseRef.current = uploadPromise;
    await uploadPromise;
  };

  // Same as uploadGlossaryFile, for TMX translation memory files.
  const uploadTmFile = async (file, existingDocumentId) => {
    if (!file) return;
    const uploadPromise = (async () => {
    setTmUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const sourceLangObj = Sourcelanguages.find((l) => l.englishName === sourceLang);
      const targetLangObj = Targetlanguages.find((l) => l.englishName === targetLang);
      const src = sourceLangObj?.code || 'en';
      const tgt = targetLangObj?.code || 'ar';

      const formData = new FormData();
      formData.append('tm_file', file);

      const res = await fetch(
        `${API_URL}/tm?source_lang=${src}&target_lang=${tgt}`,
        { method: 'POST', body: formData }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Upload failed');
      }
      const data = await res.json();

      setTmId(data.tm_id);
      tmRef.current = { id: data.tm_id, fileName: file.name, fileSize: file.size, base64 };
      tmTouchedRef.current = true;
      setTmFileBase64(base64);
      await setPendingUpload('tm', {
        id: data.tm_id, fileName: file.name, fileSize: file.size, base64,
      });

      if (existingDocumentId) {
        await saveDocumentState(existingDocumentId, {
          tmFileName: file.name,
          tmFileSize: file.size || null,
          tmId: data.tm_id,
          tmFileBase64: base64,
        });
      }
    } catch (e) {
      console.error('TM upload failed:', e);
      alert('فشل رفع ملف ذاكرة الترجمة');
      setTmFile(null);
      setTmFileName('');
      setTmFileSize(null);
      setTmId(null);
      setTmFileBase64(null);
      if (tmInputRef.current) tmInputRef.current.value = '';
    } finally {
      setTmUploading(false);
    }
    })();
    tmUploadPromiseRef.current = uploadPromise;
    await uploadPromise;
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    const isValidSelection = applySelectedFile(file);
    if (!isValidSelection && file) {
      trackWrongFileUploaded(file.name, 'main_document');
    }
    if (!isValidSelection && fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGlossaryChange = (e) => {
    const file = e.target.files[0];
    const isValidSelection = applyGlossaryFile(file);
    if (!isValidSelection && file) {
      trackWrongFileUploaded(file.name, 'glossary');
    }
    if (!isValidSelection && glossaryInputRef.current) {
      glossaryInputRef.current.value = '';
      return;
    }
    // Upload right away — works whether this happens before translation
    // starts, or after it's already done (attaches to activeDocumentId).
    uploadGlossaryFile(file, activeDocumentId);
  };

  const handleTmChange = (e) => {
    const file = e.target.files[0];
    const isValidSelection = applyTmFile(file);
    if (!isValidSelection && file) {
      trackWrongFileUploaded(file.name, 'translation_memory');
    }
    if (!isValidSelection && tmInputRef.current) {
      tmInputRef.current.value = '';
      return;
    }
    uploadTmFile(file, activeDocumentId);
  };

  const handleTrySamplePdf = async () => {
    if (isPreparingSample || (isTranslating && !downloadUrl)) return;

    setIsPreparingSample(true);
    
    
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

  const watchJobStream = useCallback(async (meta, controller) => {
    const { jobId, fileType, fileName: metaFileName, fileSize, sourceLang: metaSourceLang,
            targetLang: metaTargetLang, glossaryFileName: metaGlossaryFileName,
            glossaryFileSize: metaGlossaryFileSize, glossaryId: metaGlossaryId,
            glossaryFileBase64: metaGlossaryFileBase64,
            tmFileName: metaTmFileName, tmFileSize: metaTmFileSize, tmId: metaTmId,
            tmFileBase64: metaTmFileBase64,
            translationStartTs, thisId } = meta;

    const isCancelled = () => translationIdRef.current !== thisId;

    let translationPhase = 'reading_stream';
    let sseParseErrorTracked = false;
    let latestProgressCompleted = 0;
    let latestTotalBlocks = 0;
    const getProgressPercent = () => {
      if (!latestTotalBlocks || latestTotalBlocks <= 0) return 0;
      return Math.min(100, Math.max(0, Math.round((latestProgressCompleted / latestTotalBlocks) * 100)));
    };

    const MAX_RECONNECT_ATTEMPTS = 5;
    const RECONNECT_BASE_DELAY_MS = 3000; // exponential backoff: 1s, 2s, 4s, 8s, 16s
    let reconnectAttempt = 0;

    let finalData = null;
    let backendErrorDetail = null;

    // isRecoverableStreamError: connection dropped mid-stream (proxy idle
    // timeout, wifi blip, etc.), not a real application error. The job is
    // still alive server-side in job_store, so we just re-open the stream
    // instead of failing the whole translation.
    const isRecoverableStreamError = (error) => {
      const msg = String(error?.message || '').toLowerCase();
      return error instanceof TypeError && (
        msg.includes('network error') ||
        msg.includes('failed to fetch') ||
        msg.includes('load failed') ||
        msg.includes('error in input stream')
      );
    };

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    try {
      streamLoop:
      while (true) {
        if (isCancelled()) return;

        let response;
        try {
          response = await fetch(
            `${API_URL}/stream/${jobId}`,
            { signal: controller.signal }
          );
        } catch (fetchError) {
          if (fetchError.name === 'AbortError') return;
          if (isRecoverableStreamError(fetchError) && reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempt += 1;
            translationPhase = 'reconnecting_stream';
            setStatus('‫جارٍ إعادة الاتصال...');
            await sleep(RECONNECT_BASE_DELAY_MS * 2 ** (reconnectAttempt - 1));
            continue streamLoop;
          }
          throw fetchError;
        }

        if (!response.ok) {
          throw new Error('تعذر فتح تدفق متابعة الترجمة');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

      const processLines = (lines) => {
        for (const line of lines) {
          if (isCancelled()) return;
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            try {
              const event = JSON.parse(jsonStr);
              if (event.type === 'progress') {
                translationPhase = 'translating_blocks';
                if (event.completed === 2 && !etaStartTimeRef.current) {
                  etaStartTimeRef.current = Date.now();
                  etaBaselineCompletedRef.current = event.completed;
                  void setActiveTranslationJob({
                    ...meta,
                    etaStartTime: etaStartTimeRef.current,
                    etaBaselineCompleted: event.completed,
                  });
                }
                latestProgressCompleted = event.completed;
                latestTotalBlocks = event.total;
                setProgress(event.completed);
                setTotalBlocks(event.total);
                setStatus('‫قيد الترجمة...');
              } else if (event.type === 'done') {
                translationPhase = 'finalizing_result';
                finalData = event;
              } else if (event.type === 'error') {
                translationPhase = 'backend_job_error';
                backendErrorDetail = event.detail || 'فشلت عملية الترجمة على الخادم';  // ← CHANGED: capture instead of throw
              }
            } catch (e) {
              console.error('Failed to parse SSE event:', e);
              if (!sseParseErrorTracked) {
                sseParseErrorTracked = true;
                trackTranslationError(e, {
                  file_name: metaFileName,
                  file_size: fileSize,
                  source_lang: metaSourceLang,
                  target_lang: metaTargetLang,
                  endpoint: `/stream/${jobId}`,
                  translation_phase: 'sse_parse',
                  elapsed_ms: (Date.now() - translationStartTs) / 1000,
                  progress_percent: getProgressPercent(),
                  sse_line_preview: trimmed.substring(0, 300),
                });
              }
            }
          }
        }
      };

        let streamDroppedMidRead = false;
        try {
          while (true) {
            if (isCancelled()) return;
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop();
            processLines(lines);
          }
        } catch (readError) {
          if (isCancelled()) return;
          if (isRecoverableStreamError(readError) && reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
            streamDroppedMidRead = true;
          } else {
            throw readError;
          }
        }

        if (streamDroppedMidRead) {
          // Connection died mid-read (e.g. proxy idle timeout). The job is
          // still running server-side — back off, then re-open the stream.
          // Progress already parsed (latestProgressCompleted/latestTotalBlocks)
          // is preserved across the reconnect since it lives in the outer scope.
          reconnectAttempt += 1;
          translationPhase = 'reconnecting_stream';
          setStatus('‫جارٍ إعادة الاتصال...');
          await sleep(RECONNECT_BASE_DELAY_MS * 2 ** (reconnectAttempt - 1));
          continue streamLoop;
        }

        if (!isCancelled() && buffer.trim()) {
          processLines(buffer.split('\n\n'));
        }

        if (isCancelled()) return;

        // Stream ended cleanly (reader done) without a terminal event —
        // treat like a drop and retry rather than failing outright, since
        // some proxies close the connection right at the tail end.
        if (!finalData && !backendErrorDetail && reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempt += 1;
          translationPhase = 'reconnecting_stream';
          setStatus('‫جارٍ إعادة الاتصال...');
          await sleep(RECONNECT_BASE_DELAY_MS * 2 ** (reconnectAttempt - 1));
          continue streamLoop;
        }

        break; // got finalData, a backend error, or exhausted retries
      } // end streamLoop

      if (isCancelled()) return;

      if (!finalData) {
        translationPhase = 'missing_final_event';
        const errorMessage = backendErrorDetail
          ? `Translation failed: ${backendErrorDetail}`
          : 'لم يتم استلام نتيجة الترجمة';
        throw new Error(errorMessage);
      }

      let newFileContent = null;

      // if (fileType === 'pdf') {
      //   translationPhase = 'building_pdf_output';
      //   const blob = new Blob(
      //     [Uint8Array.from(atob(finalData.pdf), c => c.charCodeAt(0))],
      //     { type: 'application/pdf' }
      //   );
      //   const url = URL.createObjectURL(blob);
      //   setTranslatedContents(finalData.translated_contents);
      //   newFileContent = finalData.original_pdf_base64 || null;
      //   setFileContent(newFileContent);
      //   setDownloadUrl(url);
      // } 
        if (fileType === 'xliff') {
          translationPhase = 'building_xliff_output';
          const blob = new Blob([finalData.xliff], { type: 'application/xliff+xml' });
          const url = URL.createObjectURL(blob);
          setTranslatedContents(finalData.translated_contents);
          newFileContent = finalData.xliff;
          setFileContent(finalData.xliff);
          setDownloadUrl(url);
      }
      else if (fileType === 'docx' || fileType === 'pdf') {
        translationPhase = 'building_docx_output';
        const blob = new Blob(
                [Uint8Array.from(atob(finalData.original_docx_base64), c => c.charCodeAt(0))],
                { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
              );
        const url = URL.createObjectURL(blob);
        setTranslatedContents(finalData.translated_contents);
        newFileContent = finalData.original_docx_base64;
        setFileContent(finalData.original_docx_base64);
        // this is the original file, you wouldnt want the user to download this
        // I just placed it cuz, انتقل للتعديل button doesnt show unless there is a url saved
        setDownloadUrl(url);
      }

      await clearAllPersistence();

      if (isCancelled()) return;

      const resolvedGlossaryId = glossaryTouchedRef.current
        ? glossaryRef.current.id
        : (finalData.glossary_id || metaGlossaryId || null);
      const resolvedTmId = tmTouchedRef.current
        ? tmRef.current.id
        : (finalData.tm_id || metaTmId || null);
      const resolvedGlossaryFileName = glossaryTouchedRef.current ? glossaryRef.current.fileName : metaGlossaryFileName;
      const resolvedGlossaryFileSize = glossaryTouchedRef.current ? glossaryRef.current.fileSize : metaGlossaryFileSize;
      const resolvedGlossaryFileBase64 = glossaryTouchedRef.current ? glossaryRef.current.base64 : (metaGlossaryFileBase64 || null);
      const resolvedTmFileName = tmTouchedRef.current ? tmRef.current.fileName : metaTmFileName;
      const resolvedTmFileSize = tmTouchedRef.current ? tmRef.current.fileSize : metaTmFileSize;
      const resolvedTmFileBase64 = tmTouchedRef.current ? tmRef.current.base64 : (metaTmFileBase64 || null);
      console.log('Persisting document with glossaryId:', resolvedGlossaryId, 'tmId:', resolvedTmId);

      const persistedDocumentId = await createDocument({
        translatedContents: finalData.translated_contents,
        originalFile: newFileContent,
        sourceLang: metaSourceLang,
        targetLang: metaTargetLang,
        fileType: fileType,
        fileName: metaFileName,
        glossaryFileName: resolvedGlossaryFileName,
        glossaryFileSize: resolvedGlossaryFileSize,
        glossaryId: resolvedGlossaryId,
        glossaryFileBase64: resolvedGlossaryFileBase64,
        tmFileName: resolvedTmFileName,
        tmFileSize: resolvedTmFileSize,
        tmId: resolvedTmId,
        tmFileBase64: resolvedTmFileBase64,
      });

      if (isCancelled()) return;

      setActiveDocumentId(persistedDocumentId);
      setGlossaryId(resolvedGlossaryId);
      setTmId(resolvedTmId);

      // Now that the glossary/TM live on the persisted document record,
      // the standalone "pending" cache (used before any document existed)
      // is no longer needed.
      await clearPendingUpload('glossary');
      await clearPendingUpload('tm');

      clearLegacySessionStorage();

      const translationDuration = Date.now() - translationStartTs;
      trackTranslationCompleted(fileType, fileSize, translationDuration, latestTotalBlocks, true);

      void clearActiveTranslationJob();
      setStatus('‫تمت الترجمة بنجاح!');
    } catch (error) {
      if (error.name === 'AbortError') return;

      console.error("Translation Error:", error);
      void clearActiveTranslationJob();
      const elapsedMs = Date.now() - translationStartTs;
      const errorMessageLower = String(error?.message || '').toLowerCase();
      const isTimeoutError = errorMessageLower.includes('request timeout');
      const isStreamNetworkError = error instanceof TypeError && (
        errorMessageLower.includes('network error') ||
        errorMessageLower.includes('failed to fetch') ||
        errorMessageLower.includes('load failed')
      );
      const isMaxSegmentsError = errorMessageLower.includes('max segments exceeded') || errorMessageLower.includes('exceeded maximum number of segments');
      const isSourceLanguageError = errorMessageLower.includes('does not match provided source language');

      if (isTimeoutError) {
        trackNetworkError(error, {
          errorType: 'timeout',
          endpoint: `/stream/${jobId}`,
          timeout: 30000,
          context: {
            file_name: metaFileName,
            file_size: fileSize,
            source_lang: metaSourceLang,
            target_lang: metaTargetLang,
            translation_phase: translationPhase,
            elapsed_ms: elapsedMs,
            progress_percent: getProgressPercent(),
          }
        });
        setStatus('حدث خطأ أثناء الاتصال بالخادم');
      } else if (isStreamNetworkError) {
        trackNetworkError(error, {
          errorType: 'stream_interrupted',
          endpoint: `/stream/${jobId}`,
          timeout: 30000,
          context: {
            file_name: metaFileName,
            file_size: fileSize,
            source_lang: metaSourceLang,
            target_lang: metaTargetLang,
            translation_phase: translationPhase,
            elapsed_ms: elapsedMs,
            progress_percent: getProgressPercent(),
            browser_stream_error_message: error?.message || null,
            recovery_attempted: reconnectAttempt > 0,
            recovery_success: false, // reaching this catch means all reconnects failed
            reconnect_attempts: reconnectAttempt,
          },
        });
        setStatus('حدث خطأ أثناء الاتصال بالخادم. تم فقدان الاتصال بعد عدة محاولات');

      } else if (isMaxSegmentsError) {
        trackNetworkError(error, {
          errorType: 'max_segments_exceeded',
          endpoint: `/stream/${jobId}`,
          timeout: 30000,
          context: {
            file_name: metaFileName,
            file_size: fileSize,
            source_lang: metaSourceLang,
            target_lang: metaTargetLang,
            translation_phase: translationPhase,
            elapsed_ms: elapsedMs,
            progress_percent: getProgressPercent(),
            browser_stream_error_message: error?.message || null,
          },
        });
        setStatus('ملف الترجمة كبير جدًا. يرجى تقسيمه إلى ملفات أصغر');
      } else if (isSourceLanguageError) {
        trackNetworkError(error, {
          errorType: 'source_language_mismatch',
          endpoint: `/stream/${jobId}`,
          timeout: 30000,
          context: {
            file_name: metaFileName,
            file_size: fileSize,
            source_lang: metaSourceLang,
            target_lang: metaTargetLang,
            translation_phase: translationPhase,
            elapsed_ms: elapsedMs,
            progress_percent: getProgressPercent(),
            browser_stream_error_message: error?.message || null,
          },
        });
        setStatus('لغة المصدر لا تتطابق مع ملف الترجمة');
      }
      
      
      else {
        trackTranslationError(error, {
          file_name: metaFileName,
          file_size: fileSize,
          source_lang: metaSourceLang,
          target_lang: metaTargetLang,
          endpoint: `/stream/${jobId}`,
          translation_phase: translationPhase,
          elapsed_ms: elapsedMs,
          progress_percent: getProgressPercent(),
          http_status: error.status,
          status_text: error.statusText,
          error_message: error.message,
        });
        setStatus('حدث خطأ أثناء الاتصال بالخادم');

      }

    } finally {
      if (!isCancelled()) {
        setIsTranslating(false);
        setActiveAction(null);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let activeController = null;

    const restoreLatestState = async () => {
      try {
        const savedJob = await getActiveTranslationJob();

        if (!cancelled && savedJob?.jobId) {
          activeController = new AbortController();
          abortControllerRef.current = activeController;
          translationIdRef.current = savedJob.thisId;
          etaStartTimeRef.current = savedJob.etaStartTime || null;
          etaBaselineCompletedRef.current = savedJob.etaBaselineCompleted || null;

          setSelectedFile(null);
          setFileName(savedJob.fileName || '');
          setSourceLang(savedJob.sourceLang || 'English');
          setTargetLang(savedJob.targetLang || 'Arabic');
          setGlossaryFileName(savedJob.glossaryFileName || '');
          setGlossaryFileSize(savedJob.glossaryFileSize || null);
          setGlossaryId(savedJob.glossaryId || null);
          setGlossaryFileBase64(savedJob.glossaryFileBase64 || null);
          setTmFileName(savedJob.tmFileName || '');
          setTmFileSize(savedJob.tmFileSize || null);
          setTmId(savedJob.tmId || null);
          setTmFileBase64(savedJob.tmFileBase64 || null);
          setIsTranslating(true);
          setActiveAction(savedJob.segmentOnly ? 'segment' : 'translate');
          setIsPreparingSample(false);
          setProgress(0);
          setTotalBlocks(0);
          setStatus('‫قيد الترجمة...');

          await watchJobStream(savedJob, activeController);
          return;
        }

        const documentId = await getActiveDocumentId();
        if (!documentId) {
          // No job, no document yet — restore any glossary/TM the user picked
          // before starting a translation, so it survives a tab close too.
          if (!cancelled) {
            const pendingGlossary = await getPendingUpload('glossary');
            if (pendingGlossary?.id) {
              setGlossaryFileName(pendingGlossary.fileName || '');
              setGlossaryFileSize(pendingGlossary.fileSize || null);
              setGlossaryId(pendingGlossary.id);
              setGlossaryFileBase64(pendingGlossary.base64 || null);
            }
            const pendingTm = await getPendingUpload('tm');
            if (pendingTm?.id) {
              setTmFileName(pendingTm.fileName || '');
              setTmFileSize(pendingTm.fileSize || null);
              setTmId(pendingTm.id);
              setTmFileBase64(pendingTm.base64 || null);
            }
          }
          return;
        }

        const savedDocument = await loadDocument(documentId);
        if (!savedDocument || !savedDocument.translatedContents) return;

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
          setGlossaryId(savedDocument.glossaryId || null);
          setGlossaryFileBase64(savedDocument.glossaryFileBase64 || null);
          setTmFileName(savedDocument.tmFileName || '');
          setTmFileSize(savedDocument.tmFileSize || null);
          setTmId(savedDocument.tmId || null);
          setTmFileBase64(savedDocument.tmFileBase64 || null);
          setDownloadUrl('indexeddb');
          setIsTranslating(false);
          setActiveAction(null);
          setIsPreparingSample(false);
          setProgress(0);
          setTotalBlocks(0);
          setStatus('‫تمت الترجمة بنجاح!');
        }

      } catch (e) {
        console.error('Failed to restore translation data from IndexedDB:', e);
      }
    };

    restoreLatestState();

    return () => {
      cancelled = true;
      activeController?.abort();
    };
  }, [watchJobStream]);

  const handleTranslateFile = async (segmentOnly = false) => {
    if (!selectedFile) {
      alert('الرجاء اختيار ملف أولاً');
      return;
    }

    const fileType = getFileType(selectedFile.name);
    if (!fileType) {
      alert('نوع الملف غير مدعوم');
      return;
    }

    // If a glossary/TM upload is still in flight (e.g. the user picked a
    // file and immediately hit "Translate"), wait for it so glossaryId/tmId
    // are actually set before we build the request — otherwise the
    // translation would silently go out without the attached TB/TM.
    if (glossaryUploadPromiseRef.current) {
      await glossaryUploadPromiseRef.current.catch(() => {});
    }
    if (tmUploadPromiseRef.current) {
      await tmUploadPromiseRef.current.catch(() => {});
    }

    // Fresh translation run — reset "touched" tracking and seed the refs
    // with whatever glossary/TM is currently attached, so mid-flight
    // uploads/removals during *this* run can be told apart from the ones
    // that were already baked into the request below.
    glossaryTouchedRef.current = false;
    tmTouchedRef.current = false;
    glossaryRef.current = {
      id: glossaryId, fileName: glossaryFileName, fileSize: glossaryFileSize, base64: glossaryFileBase64,
    };
    tmRef.current = {
      id: tmId, fileName: tmFileName, fileSize: tmFileSize, base64: tmFileBase64,
    };

    const thisId = crypto.randomUUID();
    translationIdRef.current = thisId;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsTranslating(true);
    setActiveAction(segmentOnly ? 'segment' : 'translate');
    setProgress(0);
    setTotalBlocks(0);
    setStatus('');
    etaStartTimeRef.current = null;
    etaBaselineCompletedRef.current = null;
    const translationStartTs = Date.now();

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      // Glossary/TM are uploaded immediately on selection (see uploadGlossaryFile/
      // uploadTmFile), so by the time translation starts we already have ids —
      // pass those instead of re-sending the raw files.

      const endpoints = {
        'pdf': '/translation/pdf-as-docx',
        'docx': '/translation/docx',
        'xliff': '/translation/xliff'
      };
      const endpoint = endpoints[fileType];
      const sourceLangObj = Sourcelanguages.find(lang => lang.englishName === sourceLang);
      const targetLangObj = Targetlanguages.find(lang => lang.englishName === targetLang);
      const sourceLangCode = sourceLangObj?.code || 'en';
      const targetLangCode = targetLangObj?.code || 'ar';

      let queryParams = `source_lang=${sourceLangCode}&target_lang=${targetLangCode}`;
      if (segmentOnly) {
        queryParams += `&segment_only=true`;
      }
      if (glossaryId) {
        queryParams += `&glossary_id=${encodeURIComponent(glossaryId)}`;
      }
      if (tmId) {
        queryParams += `&tm_id=${encodeURIComponent(tmId)}`;
      }
      if (hasStyleGuideData(styleGuideData) && isStyleGuideActive) {
        const styleGuideXML = formatStyleGuideToXML(styleGuideData);
        const encodedStyleGuide = encodeURIComponent(styleGuideXML);
        queryParams += `&style_guide=${encodedStyleGuide}`;

        console.log('%c=== SENDING STYLE GUIDE TO BACKEND ===', 'color: #1D9E75; font-weight: bold; font-size: 14px;');
        console.log('XML:', styleGuideXML);
        console.log('URL-encoded param:', `style_guide=${encodedStyleGuide}`);
      } else if (hasStyleGuideData(styleGuideData) && !isStyleGuideActive) {
        console.log('%c=== STYLE GUIDE SAVED BUT DEACTIVATED - NOT SENDING TO BACKEND ===', 'color: #FF9500; font-weight: bold; font-size: 14px;');
      }

      trackTranslationStarted(fileType, selectedFile.size, sourceLang, targetLang);

      const startResponse = await fetch(
        `${API_URL}${endpoint}?${queryParams}`,
        {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        }
      );

      if (!startResponse.ok) {
        let errorDetail = 'فشلت عملية الترجمة على الخادم';
        try {
          const errorData = await startResponse.json();
          errorDetail = errorData.detail || errorData.message || errorDetail;
        } catch {
          errorDetail = `${startResponse.status} ${startResponse.statusText}`;
        }
        const error = new Error(errorDetail);
        error.status = startResponse.status;
        error.statusText = startResponse.statusText;
        error.phase = 'http_response_error';
        throw error;
      }

      const { job_id, glossary_id, tm_id } = await startResponse.json();
      console.log('Start response glossary_id:', glossary_id, 'tm_id:', tm_id);
      setGlossaryId(glossary_id || null);
      setTmId(tm_id || null);

      const meta = {
        jobId: job_id,
        fileType,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        sourceLang,
        targetLang,
        glossaryFileName,
        glossaryFileSize,
        glossaryId: glossary_id || null,
        glossaryFileBase64,
        tmFileName,
        tmFileSize,
        tmId: tm_id || null,
        tmFileBase64,
        translationStartTs,
        thisId,
        segmentOnly,
      };
      await setActiveTranslationJob(meta);

      await watchJobStream(meta, controller);
    } catch (error) {
      if (error.name === 'AbortError') return;

      console.error("Translation Error:", error);
      trackTranslationError(error, {
        file_name: selectedFile?.name,
        file_size: selectedFile?.size,
        source_lang: sourceLang,
        target_lang: targetLang,
        endpoint: fileType === 'pdf' ? '/translation/pdf' : '/translation/xliff',
        translation_phase: 'starting_job',
        http_status: error.status,
        status_text: error.statusText,
        error_message: error.message,
      });
      void clearActiveTranslationJob();
      setStatus('حدث خطأ أثناء الاتصال بالخادم');
      setIsTranslating(false);
      setActiveAction(null);
    }
  };

  const getEstimatedTime = () => {
    const baselineCompleted = etaBaselineCompletedRef.current;
    if (!etaStartTimeRef.current || baselineCompleted == null) return '‫قيد التقدير...';

    const completedSinceBaseline = progress - baselineCompleted;
    if (completedSinceBaseline < 1) return '‫قيد التقدير...';

    const elapsed = (Date.now() - etaStartTimeRef.current) / 1000;
    const avgPerBlock = elapsed / completedSinceBaseline;
    const remaining = avgPerBlock * (totalBlocks - progress);
    if (remaining < 60) return `نحو ${Math.ceil(remaining)} ثانية متبقية`;
    const mins = Math.floor(remaining / 60);
    return `نحو ${mins} دقائق متبقية`;
  };

  const handleStyleGuideConfirm = (data) => {
    setStyleGuideData(data);
    sessionStorage.setItem('translation_style_guide', JSON.stringify(data));
    sessionStorage.setItem('translation_style_guide_active', JSON.stringify(true));
    setIsStyleGuideActive(true);
    setIsStyleGuideOpen(false);
    
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
        <div className="main-grid">
        <div className="card">
        
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
                    onClick={async (e) => {
                      const saved = await getActiveTranslationJob();
                      if (saved?.jobId) {
                        fetch(`${API_URL}/cancel/${saved.jobId}`, { method: 'POST' });
                      }
                      await clearActiveTranslationJob();
                      cancelTranslation();
                      e.stopPropagation();
                      setFileName('');
                      setSelectedFile(null);
                      setGlossaryFileName('');
                      setGlossaryFile(null);
                      setGlossaryFileSize(null);
                      setGlossaryId(null);
                      setGlossaryFileBase64(null);
                      setTmFileName('');
                      setTmFile(null);
                      setTmFileSize(null);
                      setTmId(null);
                      setTmFileBase64(null);
                      await clearPendingUpload('glossary');
                      await clearPendingUpload('tm');
                      glossaryUploadPromiseRef.current = null;
                      tmUploadPromiseRef.current = null;
                      glossaryRef.current = { id: null, fileName: '', fileSize: null, base64: null };
                      tmRef.current = { id: null, fileName: '', fileSize: null, base64: null };
                      glossaryTouchedRef.current = false;
                      tmTouchedRef.current = false;
                      resetTranslationUiState();
                      if (fileInputRef.current) fileInputRef.current.value = '';
                      if (glossaryInputRef.current) glossaryInputRef.current.value = '';
                      if (tmInputRef.current) tmInputRef.current.value = '';
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

          <div className="uploads-row">
          <div className="glossary-upload">
                {!glossaryFileName ? (
                  <button
                    type="button"
                    className="glossary-upload-btn"
                    onClick={() => glossaryInputRef.current.click()}
                    disabled={glossaryUploading}
                  >
                    أضف ملف مصطلحات (TBX)
                  </button>
                ) : (
                  <div className="glossary-chip">
                    <span className="glossary-chip-icon">📘</span>
                    <span className="glossary-chip-name" title={glossaryFileName}>
                      {glossaryUploading ? `جارٍ الرفع... ${glossaryFileName}` : glossaryFileName}
                    </span>
                    
                    <button
                      type="button"
                      className="glossary-chip-remove"
                      onClick={async (e) => {
                        e.stopPropagation();
                        setGlossaryFileName('');
                        setGlossaryFile(null);
                        setGlossaryFileSize(null);
                        setGlossaryId(null);
                        setGlossaryFileBase64(null);
                        glossaryRef.current = { id: null, fileName: '', fileSize: null, base64: null };
                        glossaryTouchedRef.current = true;
                        glossaryUploadPromiseRef.current = null;
                        await clearPendingUpload('glossary');
                        if (activeDocumentId) {
                          await saveDocumentState(activeDocumentId, {
                            glossaryFileName: '', glossaryFileSize: null,
                            glossaryId: null, glossaryFileBase64: null,
                          });
                        }
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

          <div className="glossary-upload">
                {!tmFileName ? (
                  <button
                    type="button"
                    className="glossary-upload-btn"
                    onClick={() => tmInputRef.current.click()}
                    disabled={tmUploading}
                  >
                    أضف ذاكرة ترجمة (TMX)
                  </button>
                ) : (
                  <div className="glossary-chip">
                    <span className="glossary-chip-icon">📘</span>
                    <span className="glossary-chip-name" title={tmFileName}>
                      {tmUploading ? `جارٍ الرفع... ${tmFileName}` : tmFileName}
                    </span>

                    <button
                      type="button"
                      className="glossary-chip-remove"
                      onClick={async (e) => {
                        e.stopPropagation();
                        setTmFileName('');
                        setTmFile(null);
                        setTmFileSize(null);
                        setTmId(null);
                        setTmFileBase64(null);
                        tmRef.current = { id: null, fileName: '', fileSize: null, base64: null };
                        tmTouchedRef.current = true;
                        tmUploadPromiseRef.current = null;
                        await clearPendingUpload('tm');
                        if (activeDocumentId) {
                          await saveDocumentState(activeDocumentId, {
                            tmFileName: '', tmFileSize: null,
                            tmId: null, tmFileBase64: null,
                          });
                        }
                        if (tmInputRef.current) {
                          tmInputRef.current.value = '';
                        }
                      }}
                      aria-label="إزالة ملف ذاكرة الترجمة"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
          <input
            type="file"
            ref={tmInputRef}
            style={{ display: 'none' }}
            onChange={handleTmChange}
            accept=".tmx,.csv,.xlsx"
          />
          </div>

          {/* Pre-translate hint — appears when main file is ready but no glossary/TM yet */}
          {selectedFile && !isTranslating && !downloadUrl && !glossaryFileName && !tmFileName && (
          <div className="pre-translate-hint">
            <span className="pre-translate-hint-icon">💡</span>
            <span className="pre-translate-hint-text">
              للحصول على ترجمة أدق، يمكنك إضافة ملف مصطلحات أو ذاكرة ترجمة قبل البدء
            </span>
          </div>
          )}

          {/* Action Buttons */}
          <div className="action-area">
            {/* Progress Bar */}
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
              <div className="translate-buttons-row">
                <button
                  className="translate-btn segment-only-btn"
                  onClick={() => handleTranslateFile(true)}
                  disabled={!selectedFile || isTranslating || glossaryUploading || tmUploading}
                  title="تقسيم المستند إلى فقرات دون ترجمتها"
                >
                  {isTranslating && activeAction === 'segment'
                    ? (totalBlocks > 0 ? '‫قيد التقسيم...' : '‫قيد التحميل...')
                    : 'قسّم بدون ترجمة'}
                </button>
                <button 
                  className="translate-btn"
                  onClick={() => handleTranslateFile(false)}
                  disabled={!selectedFile || isTranslating || glossaryUploading || tmUploading}
                >
                  {isTranslating && activeAction === 'translate'
                    ? (totalBlocks > 0 ? '‫قيد الترجمة...' : '‫قيد التحميل...')
                    : 'ترجم المستندات'}
                </button>
              </div>
            ) : (
              <div className="results-actions">
                <button 
                  className="translate-btn edit-btn" 
                  onClick={() => {
                    navigate('/compare', { 
                      state: { 
                        documentId: activeDocumentId,
                        translatedContents: translatedContents,
                        originalFile: fileContent,
                        sourceLang: sourceLang,
                        targetLang: targetLang,
                        fileName: fileName,
                        fileType: getFileType(fileName),
                        glossaryId: glossaryId,
                        tmId: tmId,
                      }
                    });
                  }}
                >  
                  انتقل للتعديل
                </button>
              </div>
            )}
            {status && !(isTranslating && totalBlocks > 0) && (
              <p className="status-msg">{status}</p>
            )}
          </div>
        </div>

      </div>
    </div>
  </div>
  );
};

export default Torgman;