import React, { useState, useEffect } from 'react';
import {useLocation, useNavigate } from 'react-router-dom';
import '../assets/compare_interface.css';

const CompareInterface = () => {
  const location = useLocation();
  const [activeSegment, setActiveSegment] = useState(null);
  const [translatedContents, setTranslatedContents] = useState(null);
  const [originalPdf, setOriginalPdf] = useState(null);
  const [backTranslations, setBackTranslations] = useState(null);
  const [showBackTranslation, setShowBackTranslation] = useState(false);
  const [backTranslationLoading, setBackTranslationLoading] = useState(false);
  const navigate = useNavigate();
  // const API_URL = 'https://cosmoid-francis-barbarously.ngrok-free.dev';
  const API_URL = 'http://localhost:8000';


  useEffect(() => {
    // Get translatedContents from navigation state
    const contents = location.state?.translatedContents;
    const base64 = location.state?.originalPdf;
    
    if (contents) {
      setTranslatedContents(contents);
    }

    if (base64) {
      setOriginalPdf(base64);
    }

  }, [location.state]);

  const handleSegmentClick = (pageIndex, blockIndex) => {
    setActiveSegment(`${pageIndex}-${blockIndex}`);
    const row = document.getElementById(`row-${pageIndex}-${blockIndex}`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Handle text editing
  const handleArabicEdit = (pageIndex, blockIndex, newText) => {
    setTranslatedContents(prevContents => {
      const newContents = JSON.parse(JSON.stringify(prevContents)); // Deep clone
      newContents[pageIndex][blockIndex].translated_text = newText;
      console.log('Updated translatedContents:', newContents);
      return newContents;
    });
  };

  // Send updated content to backend
  const handleGeneratePDF = async () => {
    try {
      const response = await fetch(`${API_URL}/translate/generate-edited-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          translated_contents: translatedContents,
          original_pdf: originalPdf
        }),
      });

      if (!response.ok) {
        throw new Error('فشل إنشاء PDF');
      }

      const blob = await response.blob();

        // Convert blob to base64 for passing to next page
      const new_pdf_base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      // Navigate to the new page with the PDF
      navigate('/editing', {
        state: {
          newPdf: new_pdf_base64,
          originalPdf: originalPdf
        }
      });

    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('حدث خطأ أثناء إنشاء PDF');
    }
  };

  // Generate back-translation
  const handleGenerateBackTranslation = async () => {
    // If already showing, just hide it
    if (showBackTranslation) {
      setShowBackTranslation(false);
      return;
    }

    setBackTranslationLoading(true);
    try {
  
      // Extract only translated_text from translatedContents
      const translatedTextList = [];
      translatedContents.forEach(page => {
        page.forEach(block => {
          translatedTextList.push(block.translated_text);
        });
      });
      console.log(translatedTextList);
      const response = await fetch(`${API_URL}/translate/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(translatedTextList),
      });

      if (!response.ok) {
        throw new Error('فشل إنشاء الترجمة العكسية');
      }

      const backTranslationList = await response.json();
      
      // Convert flat list back to the same structure as translatedContents
      const backTranslationStructured = [];
      let index = 0;
      
      translatedContents.forEach(page => {
        const pageBacks = [];
        page.forEach(() => {
          pageBacks.push(backTranslationList[index]);
          index++;
        });
        backTranslationStructured.push(pageBacks);
      });
      
      setBackTranslations(backTranslationStructured);
      setShowBackTranslation(true);

    } catch (error) {
      console.error('Error generating back-translation:', error);
      alert('حدث خطأ أثناء إنشاء الترجمة العكسية');
    } finally {
      setBackTranslationLoading(false);
    }
  };

  // Calculate segment ID for display
  let segmentCounter = 0;

  return (
    <div className="comparison-container">
      <div className="top-bar">
        <div className="top-bar-content">
          <span className="logo">ترجمان</span>
          <div className="button-group">
            <button className="sidebar-btn" onClick={handleGeneratePDF}>
              Generate PDF
            </button>
            <button className="sidebar-btn" onClick={handleGenerateBackTranslation} disabled={backTranslationLoading}>
              {backTranslationLoading
                ? 'Loading'
                : showBackTranslation
                  ? 'Remove Back-translation'
                  : 'Generate Back-translation'}
            </button>
          </div>
        </div>
      </div>
      
      <div className="comparison-content-wrapper">
        <div className="document-area">
          <div className="document-container">
            <div className="comparison-table-header">
              <div className="header-spacer"></div>              
              <h2 className="column-header">الترجمة الإنجليزية</h2>
              {showBackTranslation && <h2 className="column-header">الترجمة العكسية</h2>}
              <h2 className="column-header">النص العربي</h2>
            </div>

            {translatedContents && translatedContents.map((page, pageIndex) => (
              page.map((block, blockIndex) => {
                segmentCounter++;
                const segmentId = `${pageIndex}-${blockIndex}`;
                
                return (
                  <div 
                    key={segmentId}
                    id={`row-${segmentId}`}
                    className={`segment-row ${activeSegment === segmentId ? 'active-row' : ''} ${showBackTranslation ? 'with-backtranslation' : ''}`}
                    onClick={() => handleSegmentClick(pageIndex, blockIndex)}
                  >
                    <div className="segment-id-column">{segmentCounter}</div>


                    <div className="segment english-side">
                      <div className="segment-text" contentEditable={false}>
                        {block.original_text || ''}
                      </div>
                    </div>

                    {showBackTranslation && (
                      <div className="segment english-side">
                        <div className="segment-text" contentEditable={false}>
                          {backTranslations && backTranslations[pageIndex] && backTranslations[pageIndex][blockIndex] 
                            ? backTranslations[pageIndex][blockIndex] 
                            : ''}
                        </div>
                      </div>
                    )}


                    <div className="segment arabic-side">
                      <div
                        className="segment-text"
                        contentEditable={true}
                        suppressContentEditableWarning
                        onBlur={(e) => handleArabicEdit(pageIndex, blockIndex, e.currentTarget.textContent)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {block.translated_text || ''}
                      </div>
                    </div>


                  </div>
                );
              })
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompareInterface;