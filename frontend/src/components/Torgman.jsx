// Torgman.jsx
import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../assets/Torgman.css';
import { API_URL } from '../apiConfig';
import {
  trackFileSelected,
  trackTranslationStarted,
  trackTranslationCompleted,
  trackDocumentDownloaded,
} from '../analytics';

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
  const fileInputRef = useRef();
  const navigate = useNavigate();

  // Load translation data from sessionStorage on component mount
  useEffect(() => {
    try {
      const savedData = sessionStorage.getItem('translationData');
      if (savedData) {
        const parsed = JSON.parse(savedData);
        setTranslatedContents(parsed.translatedContents);
        setFileContent(parsed.originalPdf);
        setSourceLang(parsed.sourceLang);
        setTargetLang(parsed.targetLang);
        setDownloadUrl('blob'); // Set a non-empty value to show the button
        setStatus('تمت الترجمة بنجاح! جاهز للتحميل.');
      }
    } catch (e) {
      console.error('Failed to load translation data from sessionStorage:', e);
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
    if (ext === 'xliff' || ext === 'xlf') return 'xliff';
    return null;
  };

  // Clear all segment chat histories from sessionStorage (called on successful new translation)
  const clearChatHistories = () => {
    const keysToDelete = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('chat_history_')) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => sessionStorage.removeItem(key));
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
    setTranslationStartTime(Date.now());

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      // Determine endpoint and source language code
      const endpoint = fileType === 'pdf' ? '/translation/pdf' : '/translation/xliff';
      const sourceLangObj = Sourcelanguages.find(lang => lang.englishName === sourceLang);
      const targetLangObj = Targetlanguages.find(lang => lang.englishName === targetLang);
      const sourceLangCode = sourceLangObj?.code || 'en';
      const targetLangCode = targetLangObj?.code || 'ar';

      // Track translation start
      trackTranslationStarted(fileType, selectedFile.size, sourceLang, targetLang);
      const response = await fetch(
        `${API_URL}${endpoint}?source_lang=${sourceLangCode}&target_lang=${targetLangCode}`,
        {
          method: 'POST',
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error('فشلت عملية الترجمة على الخادم');
      }

      // Read the SSE stream
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
                setProgress(event.completed);
                setTotalBlocks(event.total);
                setStatus(`جاري الترجمة... ${event.completed}/${event.total}`);
              } else if (event.type === 'done') {
                finalData = event;
              }
            } catch (e) {
              console.error('Failed to parse SSE event:', e);
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
        throw new Error('لم يتم استلام نتيجة الترجمة');
      }

      // Handle file-specific logic
      if (fileType === 'pdf') {
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
        setFileContent(base64);
        setDownloadUrl(url);
      } else if (fileType === 'xliff') {
        // XLIFF response includes XLIFF XML string
        const blob = new Blob([finalData.xliff], { type: 'application/xliff+xml' });
        const url = URL.createObjectURL(blob);
        setTranslatedContents(finalData.translated_contents);
        setFileContent(finalData.xliff); // Store XLIFF content
        setDownloadUrl(url);
      }

      // Wipe chat histories from previous document before saving new translation data
      clearChatHistories();

      // Save to sessionStorage to persist across page refreshes
      sessionStorage.setItem('translationData', JSON.stringify({
        translatedContents: finalData.translated_contents,
        originalPdf: fileContent, // Store base64 for PDF or XLIFF content for XLIFF
        sourceLang: sourceLang,
        targetLang: targetLang,
        fileType: fileType
      }));

      // Track translation completion
      const translationDuration = Date.now() - translationStartTime;
      trackTranslationCompleted(fileType, selectedFile.size, translationDuration, true);

      setStatus('تمت الترجمة بنجاح! جاهز للتحميل.');
    } catch (error) {
      console.error("Translation Error:", error);
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
            accept=".pdf,.xliff,.xlf"
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
                        translatedContents: translatedContents,
                        originalPdf: fileContent,
                        sourceLang: sourceLang,
                        targetLang: targetLang
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