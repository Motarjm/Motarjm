import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../assets/compare_interface.css';

const CompareInterface = () => {
  const navigate = useNavigate();
  const [activeSegment, setActiveSegment] = useState(null);

  const segments = [
    { id: 1, arabic: 'شهد الاقتصاد العالمي تغييرات كبيرة خلال العقد الماضي.', english: 'The global economy has undergone substantial shifts over the past decade.' },
    { id: 2, arabic: 'أدت العولمة والتقدم التكنولوجي إلى تشكيل مشهد اقتصادي جديد.', english: 'Globalization and technological advancements have shaped a new economic landscape.' },
    { id: 3, arabic: 'تتسم هذه الفترة بزيادة الترابط الاقتصادي.', english: 'This era is characterized by heightened economic interdependence.' },
    { id: 4, arabic: 'وظهور قوى اقتصادية جديدة، وتسارع وتيرة الابتكار.', english: 'The emergence of new economic powers, and an accelerating pace of innovation.' },
    { id: 5, arabic: 'أصبح التحول الرقمي ضرورياً للشركات للبقاء تنافسية.', english: 'Digital transformation has become imperative for businesses to maintain competitiveness.' },
    { id: 6, arabic: 'يشمل ذلك تبني تقنيات مثل الذكاء الاصطناعي.', english: 'This entails the adoption of technologies such as Artificial Intelligence.' }
  ];

  const handleSegmentClick = (id) => {
    setActiveSegment(id);
    const row = document.getElementById(`row-${id}`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="comparison-container">
      <div className="top-bar">
        <div className="top-bar-content">
          <span className="logo">ترجمان</span>
          <button className="sidebar-btn" onClick={() => navigate('/editing')}>
            Generate PDF
          </button>
        </div>
      </div>
      
      <div className="comparison-content-wrapper">
        <div className="document-area">
          <div className="document-container">
            {/* Header with improved spacing */}
            <div className="comparison-table-header">
              <div className="header-spacer"></div>
              <h2 className="column-header">النص العربي</h2>
              <h2 className="column-header">الترجمة الإنجليزية</h2>
            </div>

            {segments.map((segment) => (
              <div 
                key={segment.id} 
                id={`row-${segment.id}`}
                className={`segment-row ${activeSegment === segment.id ? 'active-row' : ''}`}
                onClick={() => handleSegmentClick(segment.id)}
              >
                {/* Number column on the left */}
                <div className="segment-id-column">{segment.id}</div>

                {/* Arabic Side */}
                <div className="segment arabic-side">
                  <div
                    className="segment-text"
                    contentEditable={true}
                    suppressContentEditableWarning
                    onClick={(e) => e.stopPropagation()}
                  >
                    {segment.arabic}
                  </div>
                </div>

                {/* English Side */}
                <div className="segment english-side">
                  <div className="segment-text" contentEditable={false}>
                    {segment.english}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompareInterface;