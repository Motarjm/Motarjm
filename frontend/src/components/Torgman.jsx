// Torgman.jsx
import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../assets/Torgman.css';
import { API_URL } from '../apiConfig';
// import StyleGuidePanel from './StyleGuidePanel';
// import { formatStyleGuideToXML, hasStyleGuideData } from '../utils/formatStyleGuideToXML';
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

const Torgman = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
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
  const [activeDocumentId, setActiveDocumentId] = useState(null);
  const fileInputRef = useRef();
  const navigate = useNavigate();
  
  // Load style guide from sessionStorage on mount
  useEffect(() => {
    const savedStyleGuide = sessionStorage.getItem('translation_style_guide');
    if (savedStyleGuide) {
      try {
        setStyleGuideData(JSON.parse(savedStyleGuide));
      } catch (e) {
        console.error('Failed to load style guide from sessionStorage:', e);
      }
    }
  }, []);

  // Load latest translated document from IndexedDB on component mount
  useEffect(() => {
    let cancelled = false;

    const hydrateLatestDocument = async () => {
      try {
        const documentId = await getActiveDocumentId();
        if (!documentId) return;

        const savedDocument = await loadDocument(documentId);
        if (!savedDocument || !savedDocument.translatedContents) return;

        if (!cancelled) {
          setActiveDocumentId(documentId);
          setTranslatedContents(savedDocument.translatedContents);
          setFileContent(savedDocument.originalFile || null);
          setSourceLang(savedDocument.sourceLang || 'English');
          setTargetLang(savedDocument.targetLang || 'Arabic');
          setFileName(savedDocument.fileName || '');
          setDownloadUrl('indexeddb');
          setStatus('تمت الترجمة بنجاح! جاهز للتحميل.');
        }
      } catch (e) {
        console.error('Failed to load translation data from IndexedDB:', e);
      }
    };

    hydrateLatestDocument();

    return () => {
      cancelled = true;
    };
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
    return null;
  };

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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const fileType = getFileType(file.name);
      if (!fileType) {
        alert('نوع الملف غير مدعوم. يرجى اختيار ملف PDF أو XLIFF');
        return;
      }
      setSelectedFile(file);
      setFileName(file.name);
      setDownloadUrl('');
      setTranslatedContents(null);
      setFileContent(null);
      setStatus('');

      // Track file selection
      trackFileSelected(fileType, file.size);
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

    setIsTranslating(true);
    setStatus('جاري المعالجة...');
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

      // Determine endpoint and source language code
      const endpoint = fileType === 'pdf' ? '/translation/pdf' : '/translation/xliff';
      const sourceLangObj = Sourcelanguages.find(lang => lang.englishName === sourceLang);
      const targetLangObj = Targetlanguages.find(lang => lang.englishName === targetLang);
      const sourceLangCode = sourceLangObj?.code || 'en';
      const targetLangCode = targetLangObj?.code || 'ar';

      // Build query params including style guide if present
      let queryParams = `source_lang=${sourceLangCode}&target_lang=${targetLangCode}`;
      // if (hasStyleGuideData(styleGuideData)) {
      //   const styleGuideXML = formatStyleGuideToXML(styleGuideData);
      //   const encodedStyleGuide = encodeURIComponent(styleGuideXML);
      //   queryParams += `&style_guide=${encodedStyleGuide}`;
      // }

      // Track translation start
      trackTranslationStarted(fileType, selectedFile.size, sourceLang, targetLang);
      translationPhase = 'uploading_file';
      const response = await fetch(
        `${API_URL}${endpoint}?${queryParams}`,
        {
          method: 'POST',
          body: formData,
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
                setStatus(`جاري الترجمة... ${event.completed}/${event.total}`);
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
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();
        processLines(lines);
      }

      // Process any remaining data left in the buffer after stream ends
      if (buffer.trim()) {
        processLines(buffer.split('\n\n'));
      }

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
      } else if (fileType === 'xliff') {
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

      const persistedDocumentId = await createDocument({
        translatedContents: finalData.translated_contents,
        originalFile: newFileContent,
        sourceLang: sourceLang,
        targetLang: targetLang,
        fileType: fileType,
        fileName: fileName,
      });
      setActiveDocumentId(persistedDocumentId);

      // Remove old sessionStorage artifacts so restore behavior is deterministic.
      clearLegacySessionStorage();

      // Track translation completion
      const translationDuration = Date.now() - translationStartTs;
      trackTranslationCompleted(fileType, selectedFile.size, translationDuration, true);

      setStatus('تمت الترجمة بنجاح! جاهز للتحميل.');
    } catch (error) {
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
      setIsTranslating(false);
    }
  };

  const getEstimatedTime = () => {
    if (!translationStartTime || progress < 1) return 'جاري التقدير...';
    const elapsed = (Date.now() - translationStartTime) / 1000; // seconds
    const avgPerBlock = elapsed / progress;
    const remaining = avgPerBlock * (totalBlocks - progress);
    if (remaining < 60) return `~${Math.ceil(remaining)} ثانية متبقية`;
    const mins = Math.floor(remaining / 60);
    return `~${mins} minutes remaining`;
  };

  const handleStyleGuideConfirm = (data) => {
    setStyleGuideData(data);
    sessionStorage.setItem('translation_style_guide', JSON.stringify(data));
    setIsStyleGuideOpen(false);
  };

  const handleStyleGuideCancel = () => {
    setIsStyleGuideOpen(false);
  };

  return (
    <div className="container">
      <section className="hero-section">
        <div className="logo-container">
          <h1 className="logo">تُرجمان</h1>
        </div>
        <div className="accent-line"></div>
        <h2 className="hero-title">ترجم مستنداتك باحترافية وسرعة</h2>
      </section>

      <div className="main-grid">
        <div className="card">
          <h2 className="section-title">رفع المستندات</h2>
          
          {/* Style Guide Toggle Button
          <div className="style-guide-toggle">
            <button
              className={`btn-toggle-guide ${isStyleGuideOpen ? 'active' : ''} ${hasStyleGuideData(styleGuideData) ? 'has-data' : ''}`}
              onClick={() => setIsStyleGuideOpen(!isStyleGuideOpen)}
            >
              <span className="icon">⚙️</span>
              {hasStyleGuideData(styleGuideData) ? 'استخدام دليل نمط ✓' : 'إضافة دليل نمط (اختياري)'}
            </button>
          </div> */}

          {/* Style Guide Panel - Conditionally Rendered */}
          {
            /*
          isStyleGuideOpen && (
            <StyleGuidePanel 
              onConfirm={handleStyleGuideConfirm}
              onCancel={handleStyleGuideCancel}
              initialData={styleGuideData}
            />
          )
            */
          }
          
          {/* Language Selection */}
          <div className="language-selector">
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

            <div className="arrow-icon">→</div>

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
          </div>

          {/* Upload Area */}
          <div
            className="upload-area"
            onClick={() => fileInputRef.current.click()}
          >
            <div className="upload-icon">📤</div>
            <div className="upload-text">اسحب وأفلت ملفاتك هنا</div>
            <div className="upload-hint">PDF, XLIFF ‫(الحد الأقصى ‫10MB)</div>


          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleFileChange}
            accept=".pdf,.xliff,.xlf,.sdlxliff,.mqxliff"
          />

          {/* File Display */}
          {fileName && (
            <div className="file-list-container">
              <div className="file-card">
                <span className="file-type-icon">📄</span>
                <div className="file-details">
                  <div className="file-name">{fileName}</div>
                  <div className="file-meta">
                    {(selectedFile?.size / 1024).toFixed(1)} KB • جاهز للترجمة
                  </div>
                </div>
                <button 
                  className="remove-file" 
                  onClick={() => {setFileName(''); setSelectedFile(null);}}
                >
                  ✕
                </button>
              </div>
            </div>
          )}

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
                {isTranslating ? 'جاري التحميل...' : 'ترجم المستندات'}
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
  );
};

export default Torgman;