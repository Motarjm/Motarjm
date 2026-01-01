// EditingInterface.jsx
// Migrated from editing_interface.html to React
import React, { useState, useEffect } from 'react';
import {useLocation } from 'react-router-dom';
import PDFViewer from './PDFViewer';
import '../assets/editing_interface.css';

const ARABIC_PDF_URL = '/static/MQM_study.pdf';
const ENGLISH_PDF_URL = '/static/MQM_study.pdf';

const EditingInterface = () => {

  const location = useLocation();
  const [originalPdfBytes, setOriginalPdfBytes] = useState(null);
  const [newPdfBytes, setNewPdfBytes] = useState(null);

  useEffect(() => {
      // Get translatedContents from navigation state
      const newPdfBase64 = location.state?.newPdf;
      const originalPdfBase64 = location.state?.originalPdf;

      if (newPdfBase64) {
          // Convert base64 to Uint8Array
          const binaryString = atob(newPdfBase64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          setNewPdfBytes(bytes);
      }

      if (originalPdfBase64) {
        // Convert base64 to Uint8Array
          const binaryString = atob(originalPdfBase64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
        setOriginalPdfBytes(bytes);
      }

    }, [location.state]);

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
              <PDFViewer pdfUrl={newPdfBytes} />
            </div>
          </div>
        </div>
        <div className="document-column" id="englishColumn">
          <h3 className="column-title">النص الإنجليزي</h3>
          <div className="pdf-wrapper" id="englishPdfWrapper">
            <div className="pdf-container" id="englishPdfContainer">
              <PDFViewer pdfUrl={originalPdfBytes} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditingInterface;
