import React, { useState } from 'react';
import '../assets/compare_interface.css';

const CompareInterface = ({ navigateTo }) => {
  const [activeSegment, setActiveSegment] = useState(null);
  const [activeTab, setActiveTab] = useState({});

  const segments = [
    {
      id: 1,
      final: 'The global economy has undergone <span class="add">substantial shifts</span> over the past decade.',
      original: 'شهد الاقتصاد العالمي تغييرات كبيرة خلال العقد الماضي.',
      translation: 'The global economy has undergone <span class="add">substantial shifts</span> over the past decade.',
      backtranslation: 'The global economy witnessed <span class="diff">huge changes</span> during the last decade.'
    },
    {
      id: 2,
      final: 'Globalization and technological advancements have shaped a new economic landscape.',
      original: 'أدت العولمة والتقدم التكنولوجي إلى تشكيل مشهد اقتصادي جديد.',
      translation: 'Globalization and technological advancements have shaped a new economic landscape.',
      backtranslation: 'Globalization and tech progress led to the formation of a new economic scene.'
    },
    {
      id: 3,
      final: 'This era is characterized by heightened economic interdependence.',
      original: 'تتسم هذه الفترة بزيادة الترابط الاقتصادي.',
      translation: 'This era is characterized by heightened economic interdependence.',
      backtranslation: 'This period is marked by an increase in economic interconnectivity.'
    },
    {
      id: 4,
      final: 'The emergence of new economic powers, and an <span class="add">accelerating</span> pace of innovation.',
      original: 'وظهور قوى اقتصادية جديدة، وتسارع وتيرة الابتكار.',
      translation: 'The emergence of new economic powers, and an <span class="add">accelerating</span> pace of innovation.',
      backtranslation: 'And the appearance of new economic powers, and fast innovation.'
    },
    {
      id: 5,
      final: 'Digital transformation has become <span class="add">imperative</span> for businesses to maintain competitiveness.',
      original: 'أصبح التحول الرقمي ضرورياً للشركات للبقاء تنافسية.',
      translation: 'Digital transformation has become <span class="add">imperative</span> for businesses to maintain competitiveness.',
      backtranslation: 'Digital transformation became necessary for companies to stay competitive.'
    },
    {
      id: 6,
      final: 'This entails the adoption of technologies such as Artificial Intelligence.',
      original: 'يشمل ذلك تبني تقنيات مثل الذكاء الاصطناعي.',
      translation: 'This entails the adoption of technologies such as Artificial Intelligence.',
      backtranslation: 'This includes adopting tech like AI.'
    }
  ];

  const toggleSegment = (id) => {
    if (activeSegment === id) {
      setActiveSegment(null);
    } else {
      setActiveSegment(id);
      if (!activeTab[id]) {
        setActiveTab({ ...activeTab, [id]: 'translation' });
      }
    }
  };

  const switchTab = (segmentId, tabName) => {
    setActiveTab({ ...activeTab, [segmentId]: tabName });
  };

  return (
    <div className="comparison-container">
      <div className="top-bar">
      <div className="top-bar-content">
        <span className="logo">ترجمان</span>
        <button className="sidebar-btn" onClick={() => navigateTo('main')}>
          رجوع
        </button>
      </div>
    </div>

      <div className="document-area">
        <div className="document-container">
          <div className="instruction-text">
            انقر على أي جملة للمقارنة. يمكنك التحرير مباشرةً في النص النهائي.
          </div>

          {segments.map((segment) => (
            <div
              key={segment.id}
              className={`segment ${activeSegment === segment.id ? 'active' : ''}`}
              onClick={() => toggleSegment(segment.id)}
            >
              <div className="final-text-wrapper">
                <span className="seg-id">{segment.id}</span>
                <div
                  className="final-text"
                  contentEditable
                  suppressContentEditableWarning
                  dangerouslySetInnerHTML={{ __html: segment.final }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              <div className="comparison-panel">
                <div className="tab-nav" onClick={(e) => e.stopPropagation()}>
                  <button
                    className={`tab-btn ${(!activeTab[segment.id] || activeTab[segment.id] === 'translation') ? 'active' : ''}`}
                    onClick={() => switchTab(segment.id, 'translation')}
                  >
                    الترجمة
                  </button>
                  <button
                    className={`tab-btn ${activeTab[segment.id] === 'backtranslation' ? 'active' : ''}`}
                    onClick={() => switchTab(segment.id, 'backtranslation')}
                  >
                    إعادة الترجمة
                  </button>
                </div>

                <div className={`tab-content ${(!activeTab[segment.id] || activeTab[segment.id] === 'translation') ? 'active' : ''}`}>
                  <div className="comparison-grid">
                    <div className="comp-col col-ar">
                      <h4>النص الأصلي</h4>
                      <div className="comp-text">{segment.original}</div>
                    </div>
                    <div className="comp-col col-en">
                      <h4>الترجمة</h4>
                      <div className="comp-text" dangerouslySetInnerHTML={{ __html: segment.translation }} />
                    </div>
                  </div>
                </div>

                <div className={`tab-content ${activeTab[segment.id] === 'backtranslation' ? 'active' : ''}`}>
                  <div className="comparison-grid">
                    <div className="comp-col col-ar">
                      <h4>النص الأصلي</h4>
                      <div className="comp-text">{segment.original}</div>
                    </div>
                    <div className="comp-col col-back">
                      <h4>إعادة الترجمة</h4>
                      <div className="comp-text" dangerouslySetInnerHTML={{ __html: segment.backtranslation }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CompareInterface;