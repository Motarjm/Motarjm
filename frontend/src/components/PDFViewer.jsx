// PDFViewer.jsx
// React component for rendering a PDF using PDF.js
import React, { useEffect, useRef, useState } from 'react';
// import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist';

import 'pdfjs-dist/web/pdf_viewer.css';


// Set the workerSrc for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const PDFViewer = ({ pdfUrl, loadingMessage = 'جاري تحميل المستند...', errorMessage = 'خطأ في تحميل المستند' }) => {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const renderPDF = async () => {
      setLoading(true);
      setError(false);
      const container = containerRef.current;
      if (!container) return;
      container.innerHTML = '';
      try {
        const loadingTask = pdfjsLib.getDocument( pdfUrl);
        const pdf = await loadingTask.promise;
        if (!isMounted) return;
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const canvas = document.createElement('canvas');
          canvas.className = 'pdf-page-canvas';
          const context = canvas.getContext('2d');
          const viewport = page.getViewport({ scale: 1.0 });
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          const renderContext = {
            canvasContext: context,
            viewport: viewport
          };
          await page.render(renderContext).promise;
          container.appendChild(canvas);
        }
        setLoading(false);
      } catch (e) {
        console.error('Error loading PDF:', e);
        if (isMounted) {
          setError(true);
          setLoading(false);
        }
      }
    };
    renderPDF();
    return () => { isMounted = false; };
  }, [pdfUrl]);

  return (
    <div className="pdf-viewer-container">
      {loading && <div className="loading-message">{loadingMessage}</div>}
      {error && <div className="loading-message error">{errorMessage}</div>}
      <div ref={containerRef} />
    </div>
  );
};

export default PDFViewer;
