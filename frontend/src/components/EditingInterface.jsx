// EditingInterface.jsx
// Migrated from editing_interface.html to React
import React from 'react';
import PDFViewer from './PDFViewer';
import '../assets/editing_interface.css';

const ARABIC_PDF_URL = '/static/MQM_study.pdf';
const ENGLISH_PDF_URL = '/static/MQM_study.pdf';

const EditingInterface = () => {
  const downloadDocument = () => {
    alert('جاري تحميل المستند بصيغة PDF...');
    // window.open(ARABIC_PDF_URL, '_blank');
  };

  return (
    <div className="main-container">
      <div className="top-bar" id="topBar">
        <div className="top-bar-content">
          <span className="logo">ترجمان</span>
          <button className="download-btn" onClick={downloadDocument}>⬇ PDF</button>
        </div>
      </div>
      <div className="documents-container">
        <div className="document-column" id="arabicColumn">
          <h3 className="column-title">النص العربي</h3>
          <div className="pdf-wrapper" id="arabicPdfWrapper">
            <div className="pdf-container" id="arabicPdfContainer">
              <PDFViewer pdfUrl={ARABIC_PDF_URL} />
            </div>
          </div>
        </div>
        <div className="document-column" id="englishColumn">
          <h3 className="column-title">النص الإنجليزي</h3>
          <div className="pdf-wrapper" id="englishPdfWrapper">
            <div className="pdf-container" id="englishPdfContainer">
              <PDFViewer pdfUrl={ENGLISH_PDF_URL} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditingInterface;
