// Torgman.jsx
import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../assets/Torgman.css';

const Torgman = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState('');
  const [downloadUrl, setDownloadUrl] = useState(''); 
  const [translatedContents, setTranslatedContents] = useState(null);
  const [pdfBase64, setPdfBase64] = useState(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [sourceLang, setSourceLang] = useState('English');
  const [targetLang, setTargetLang] = useState('Arabic');
  const fileInputRef = useRef();
  const navigate = useNavigate();

  const Sourcelanguages = [
    { code: 'en', name: 'English', englishName: 'English' },
  ];

  const Targetlanguages = [
    { code: 'ar', name: 'العربية', englishName: 'Arabic' },
    { code: 'ar_eg', name: 'العربية المصرية', englishName: 'Egyptian Arabic' },
    { code: 'ar_sa', name: 'العربية السعودية', englishName: 'Saudi Arabic' },
  ];



  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setFileName(file.name);
      setDownloadUrl('');
      setTranslatedContents(null);
      setPdfBase64(null);
      setStatus('');
    }
  };

  const handleTranslateFile = async () => {
    if (!selectedFile) {
      alert('الرجاء اختيار ملف أولاً');
      return;
    }
    setIsTranslating(true);
    setStatus('جاري المعالجة...');
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      console.log(sourceLang)
      console.log(targetLang)

      const response = await fetch(
        `http://localhost:8000/translate/pdf_file?source_lang=${sourceLang}&target_lang=${targetLang}`,
        {
          method: 'POST',
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error('فشلت عملية الترجمة على الخادم');
      }

      const data = await response.json();
      const blob = new Blob(
        [Uint8Array.from(atob(data.pdf), c => c.charCodeAt(0))], 
        { type: 'application/pdf' }
      );
      const url = URL.createObjectURL(blob);

      setTranslatedContents(data.translated_contents);

      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });

      setPdfBase64(base64);
      setDownloadUrl(url);
      setStatus('تمت الترجمة بنجاح! جاهز للتحميل.');
    } catch (error) {
      console.error("Translation Error:", error);
      setStatus('حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setIsTranslating(false);
    }
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
            <div className="upload-hint">PDF, DOCX, TXT (الحد الأقصى 10MB)</div>
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleFileChange} 
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
                <a 
                  href={downloadUrl} 
                  download="translated_file.pdf" 
                  className="translate-btn download-btn"
                >
                  تحميل الملف
                </a>
                <button 
                  className="translate-btn edit-btn" 
                  onClick={() => navigate('/compare', { 
                    state: { 
                      translatedContents: translatedContents,
                      originalPdf: pdfBase64 
                    }
                  })}
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