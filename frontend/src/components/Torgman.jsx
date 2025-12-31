// Torgman.jsx
// Migrated from Torgman.html and Torgman.js to React
import React, { useRef, useState } from 'react';
import '../assets/Torgman.css';

const LANGUAGES = [
  { value: 'ar', label: 'العربية' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
];

const Torgman = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [sourceLang, setSourceLang] = useState('ar');
  const [targetLang, setTargetLang] = useState('en');
  const [sourceText, setSourceText] = useState('');
  const [targetText, setTargetText] = useState('');
  const fileInputRef = useRef();

  // File upload handlers
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setSelectedFile(file);
    setFileName(file ? file.name : '');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    setSelectedFile(file);
    setFileName(file ? file.name : '');
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // File translation handler (simulated)
  const handleTranslateFile = async () => {
    if (!selectedFile) {
      alert('Please select or drop a file first!');
      return;
    }
    setStatus('Translating... Please wait.');
    setDownloadUrl('');
    // Simulate translation delay
    setTimeout(() => {
      const blob = new Blob([`[ترجمة تجريبية]
${fileName}`], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setStatus('Translation complete.');
    }, 1200);
  };

  // Language swap
  const swapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSourceText(targetText);
    setTargetText(sourceText);
  };

  // Text translation (simulated)
  const handleTranslateText = () => {
    if (!sourceText.trim()) {
      alert('الرجاء إدخال نص للترجمة');
      return;
    }
    setTargetText('جارٍ الترجمة...');
    setTimeout(() => {
      setTargetText(`[ترجمة تجريبية]\n${sourceText}`);
    }, 1000);
  };

  return (
    <div className="container">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="logo-container">
          <h1 className="logo">تُرجمان</h1>
        </div>
        <div className="accent-line"></div>
        <h2 className="hero-title">ترجم مستنداتك باحترافية وسرعة</h2>
        <p className="hero-subtitle">
          منصة احترافية متكاملة لترجمة المستندات بكل سهولة. نوفر لك أدوات قوية وسريعة لترجمة ملفاتك بدقة عالية ومعايير احترافية
        </p>
      </section>
      <div className="main-grid">
        <div className="upload-section card">
          <h2 className="section-title">رفع المستندات</h2>
          <div
            className="upload-area"
            onClick={() => fileInputRef.current.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <div className="upload-icon">📄</div>
            <div className="upload-text">
              {fileName ? `Selected: ${fileName}` : 'اسحب وأفلت ملفاتك هنا'}
            </div>
            <div className="upload-hint">أو اضغط للاختيار • PDF, DOC, DOCX, TXT</div>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            className="file-input"
            multiple={false}
            accept=".pdf,.doc,.docx,.txt"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <div className="file-list">
            {fileName && (
              <div className="file-item">
                <div className="file-info">
                  <div className="file-name">{fileName}</div>
                  <div className="file-size">{selectedFile ? (selectedFile.size / 1024).toFixed(2) : 0} كيلوبايت</div>
                </div>
                <span className="file-check">✓</span>
              </div>
            )}
          </div>
          <button className="translate-btn" onClick={handleTranslateFile}>ترجم المستندات</button>
          {downloadUrl && (
            <a href={downloadUrl} download="translated.txt" style={{ display: 'inline-block' }}>إضغط للتحميل</a>
          )}
          <p>{status}</p>
        </div>
        <div className="translator-section card">
          <h3 className="section-title">ترجمة فورية</h3>
          <div className="lang-selector">
            <select
              className="lang-btn"
              value={sourceLang}
              onChange={e => setSourceLang(e.target.value)}
            >
              {LANGUAGES.map(lang => (
                <option key={lang.value} value={lang.value}>{lang.label}</option>
              ))}
            </select>
            <button className="swap-btn" onClick={swapLanguages}>⇄</button>
            <select
              className="lang-btn"
              value={targetLang}
              onChange={e => setTargetLang(e.target.value)}
            >
              {LANGUAGES.map(lang => (
                <option key={lang.value} value={lang.value}>{lang.label}</option>
              ))}
            </select>
          </div>
          <textarea
            className="text-area"
            value={sourceText}
            onChange={e => setSourceText(e.target.value)}
            placeholder="اكتب النص هنا للترجمة..."
          />
          <button className="translate-btn" onClick={handleTranslateText}>ترجم الآن</button>
          <textarea
            className="text-area"
            value={targetText}
            readOnly
            placeholder="ستظهر الترجمة هنا..."
          />
        </div>
      </div>
    </div>
  );
};

export default Torgman;
