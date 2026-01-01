// Torgman.jsx
import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../assets/Torgman.css';

// Added navigateTo prop to handle page switching
const Torgman = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [isTranslating, setIsTranslating] = useState(false); // Track loading state
  const fileInputRef = useRef();
  const navigate = useNavigate();
  


  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setFileName(file.name);
      setDownloadUrl(''); // Reset if new file uploaded
      setStatus('');
    }
  };

  // OLD: const handleTranslateFile = async () => { ... }
  // NEW: Refined with loading states and button logic
  const handleTranslateFile = async () => {
    if (!selectedFile) {
      alert('الرجاء اختيار ملف أولاً');
      return;
    }
    setIsTranslating(true);
    setStatus('جارٍ المعالجة...');
    
    try {
      // 1. Prepare form data for the backend
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('source_lang', 'en'); // Example static values
      formData.append('target_lang', 'ar');

      // 2. Fetch the PDF from your FastAPI endpoint
      const response = await fetch('http://localhost:8000/translate/pdf_file?source_lang=en&target_lang=ar', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('فشلت عملية الترجمة على الخادم');
      }

      // 3. Receive the response as a binary BLOB
      const blob = await response.blob();
      
      // 4. Create a temporary URL for the browser
      const url = window.URL.createObjectURL(blob);
      
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
        <div className="upload-section card">
          <h2 className="section-title">رفع المستندات</h2>
          
          {/* Upload Area */}
          <div
            className="upload-area"
            onClick={() => fileInputRef.current.click()}
          >
            <div className="upload-icon">📤</div>
            <div className="upload-text">اسحب وأفلت ملفاتك هنا</div>
            <div className="upload-hint">PDF, DOCX, TXT (الحد الأقصى 10MB)</div>
          </div>
          <input type="file" ref={fileInputRef} className="file-input" style={{ display: 'none' }} onChange={handleFileChange} />

          {/* NEW: Clean File Item Display */}
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
                <button className="remove-file" onClick={() => {setFileName(''); setSelectedFile(null);}}>✕</button>
              </div>
            </div>
          )}

          {/* NEW: Button Logic with identical styling */}
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
                <a href={downloadUrl} download="translated_file.pdf" className="translate-btn download-btn">
                  تحميل الملف
                </a>
                <button className="translate-btn edit-btn" onClick={() => navigate('/compare')}>
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