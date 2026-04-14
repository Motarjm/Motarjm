import React, { useState } from 'react';
import '../assets/style-guide.css';

const StyleGuidePanel = ({ onConfirm, onCancel, initialData = {}, isActive = false, onToggleActive }) => {
  const [currentSection, setCurrentSection] = useState(0);
  const [data, setData] = useState(initialData);
  const [completedSections, setCompletedSections] = useState({});

  const sections = [
    {
      id: 'tone',
      title: 'Tone & register',
      desc: 'Define how your translations should sound and feel.',
      fields: [
        { name: 'register', label: 'Register', type: 'chips', options: ['Formal', 'Semi-formal', 'Conversational', 'Colloquial'] },
        { name: 'address', label: 'Form of address', type: 'chips', options: ['Direct-formal', 'Direct-informal', 'Impersonal', 'Varies by section'] },
        { name: 'emotion', label: 'Emotional tone', type: 'chips', options: ['Neutral', 'Reassuring', 'Authoritative', 'Warm', 'Urgent', 'Playful'] },
        { name: 'toneNotes', label: 'Additional notes', type: 'textarea', placeholder: 'Any specific tone guidance...' },
      ],
    },
    {
      id: 'audience',
      title: 'Target audience',
      desc: 'Specify who will read these translations.',
      fields: [
        { name: 'expertise', label: 'Expertise level', type: 'chips', options: ['Layperson', 'Semi-specialist', 'Specialist', 'Mixed'] },
        { name: 'ageGroup', label: 'Age group', type: 'chips', options: ['Children', 'Teens', 'Young adults', 'Adults', 'Seniors'] },
        { name: 'culturalVariant', label: 'Cultural variant', type: 'text', placeholder: 'e.g. Egyptian Arabic' },
        { name: 'audienceNotes', label: 'Additional notes', type: 'textarea', placeholder: 'Any specific audience guidance...' },
      ],
    },
    {
      id: 'sentence',
      title: 'Sentence style & structure',
      desc: 'Control how sentences should be structured.',
      fields: [
        { name: 'sentenceLen', label: 'Sentence length', type: 'chips', options: ['Short', 'Balanced', 'Long', 'Mirror source'] },
        { name: 'structureFidelity', label: 'Structure fidelity', type: 'chips', options: ['Close', 'Natural', 'Free'] },
        { name: 'passive', label: 'Passive voice', type: 'chips', options: ['Allow', 'Reduce', 'Avoid', 'Prefer'] },
        { name: 'styleNotes', label: 'Additional notes', type: 'textarea', placeholder: 'Any specific style guidance...' },
      ],
    },
    {
      id: 'numbers',
      title: 'Numbers dates & units',
      desc: 'Specify formatting for numbers, dates, and units.',
      fields: [
        { name: 'dateFormat', label: 'Date format', type: 'chips', options: ['DD/MM/YYYY', 'MM/DD/YYYY', 'Written', 'ISO 8601', 'Mirror source'] },
        { name: 'decimal', label: 'Decimal separator', type: 'chips', options: ['Period (.)', 'Comma (,)', 'Mirror source'] },
        { name: 'units', label: 'Units handling', type: 'chips', options: ['Keep source', 'Convert to target', 'Both'] },
        { name: 'currency', label: 'Currency handling', type: 'chips', options: ['Keep symbol', 'Convert', 'Symbol only'] },
        { name: 'numNotes', label: 'Additional notes', type: 'textarea', placeholder: 'Any specific number/date guidance...' },
      ],
    },
    {
      id: 'cultural',
      title: 'Cultural adaptation',
      desc: 'Define how to handle cultural references and idioms.',
      fields: [
        { name: 'adaptation', label: 'Adaptation level', type: 'chips', options: ['Literal', 'Functional', 'Localized'] },
        { name: 'idioms', label: 'Idiom handling', type: 'chips', options: ['Translate literally', 'Find equivalent', 'Neutralize', 'Omit'] },
        { name: 'culturalRefs', label: 'Cultural references', type: 'chips', options: ['Keep', 'Localize', 'Keep+explain', 'Omit'] },
        { name: 'humor', label: 'Humor handling', type: 'chips', options: ['Recreate', 'Neutralize', 'Flag', 'None'] },
        { name: 'culturalNotes', label: 'Additional notes', type: 'textarea', placeholder: 'Any specific cultural guidance...' },
      ],
    },
    {
      id: 'review',
      title: 'Review & confirm',
      desc: 'Review your style guide and use it for translation.',
      fields: [],
    },
  ];

  const handleChipSelect = (fieldName, value) => {
    setData((prev) => ({
      ...prev,
      [fieldName]: prev[fieldName] === value ? '' : value,
    }));
  };

  const handleMultiCheckChange = (fieldName, value) => {
    setData((prev) => {
      const current = Array.isArray(prev[fieldName]) ? prev[fieldName] : [];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [fieldName]: updated };
    });
  };

  const handleTextChange = (fieldName, value) => {
    setData((prev) => ({ ...prev, [fieldName]: value }));
  };

  const markSectionDone = () => {
    setCompletedSections((prev) => ({
      ...prev,
      [sections[currentSection].id]: true,
    }));
  };

  const handleNext = () => {
    markSectionDone();
    if (currentSection < sections.length - 1) {
      setCurrentSection(currentSection + 1);
    }
  };

  const handlePrev = () => {
    if (currentSection > 0) {
      setCurrentSection(currentSection - 1);
    }
  };

  const handleUseGuide = () => {
    markSectionDone();
    onConfirm(data);
  };

  const currentSectionData = sections[currentSection];
  const progress = ((currentSection + 1) / sections.length) * 100;

  return (
    <div className="style-guide-panel">
      <div className="sg-header">
        <div className="sg-header-top">
          <div>
            <h2>Style guide builder</h2>
            <p>Define how your translations should sound, read, and feel. You can skip any section.</p>
          </div>
          {onToggleActive && (
            <div className="sg-active-toggle">
              <button
                className={`toggle-btn ${isActive ? 'active' : ''}`}
                onClick={onToggleActive}
                title={isActive ? 'Deactivate style guide' : 'Activate style guide'}
              >
                <span className="toggle-icon">{isActive ? '✓' : '○'}</span>
                <span className="toggle-text">{isActive ? 'Active' : 'Inactive'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="section-nav">
        {sections.map((section, idx) => (
          <button
            key={section.id}
            className={`nav-pill ${idx === currentSection ? 'active' : ''} ${completedSections[section.id] ? 'done' : ''}`}
            onClick={() => setCurrentSection(idx)}
          >
            {section.title.split(' ')[0]}
          </button>
        ))}
      </div>

      <div className="section-card">
        <div className="section-title">{currentSectionData.title}</div>
        <div className="section-desc">{currentSectionData.desc}</div>

        {currentSection === sections.length - 1 ? (
          <div className="review-section">
            <div className="summary-heading">Your style guide includes:</div>
            {data.register && <div className="summary-item"><strong>Register:</strong> {data.register}</div>}
            {data.address && <div className="summary-item"><strong>Address:</strong> {data.address}</div>}
            {data.emotion && <div className="summary-item"><strong>Emotion:</strong> {data.emotion}</div>}
            {data.toneNotes && <div className="summary-item"><strong>Tone notes:</strong> {data.toneNotes}</div>}
            
            {data.expertise && <div className="summary-item"><strong>Audience expertise:</strong> {data.expertise}</div>}
            {data.ageGroup && <div className="summary-item"><strong>Age group:</strong> {data.ageGroup}</div>}
            {data.culturalVariant && <div className="summary-item"><strong>Cultural variant:</strong> {data.culturalVariant}</div>}
            {data.audienceNotes && <div className="summary-item"><strong>Audience notes:</strong> {data.audienceNotes}</div>}
            
            {data.sentenceLen && <div className="summary-item"><strong>Sentence length:</strong> {data.sentenceLen}</div>}
            {data.structureFidelity && <div className="summary-item"><strong>Structure fidelity:</strong> {data.structureFidelity}</div>}
            {data.passive && <div className="summary-item"><strong>Passive voice:</strong> {data.passive}</div>}
            {data.styleNotes && <div className="summary-item"><strong>Style notes:</strong> {data.styleNotes}</div>}
            
            {data.dateFormat && <div className="summary-item"><strong>Date format:</strong> {data.dateFormat}</div>}
            {data.decimal && <div className="summary-item"><strong>Decimal separator:</strong> {data.decimal}</div>}
            {data.units && <div className="summary-item"><strong>Units handling:</strong> {data.units}</div>}
            {data.currency && <div className="summary-item"><strong>Currency handling:</strong> {data.currency}</div>}
            {data.numNotes && <div className="summary-item"><strong>Number/date notes:</strong> {data.numNotes}</div>}
            
            {data.adaptation && <div className="summary-item"><strong>Cultural adaptation:</strong> {data.adaptation}</div>}
            {data.idioms && <div className="summary-item"><strong>Idiom handling:</strong> {data.idioms}</div>}
            {data.culturalRefs && <div className="summary-item"><strong>Cultural references:</strong> {data.culturalRefs}</div>}
            {data.humor && <div className="summary-item"><strong>Humor handling:</strong> {data.humor}</div>}
            {data.culturalNotes && <div className="summary-item"><strong>Cultural notes:</strong> {data.culturalNotes}</div>}
          </div>
        ) : (
          <div className="fields-container">
            {currentSectionData.fields.map((field) => (
              <div key={field.name} className="field-group">
                <label className="field-label">{field.label}</label>

                {field.type === 'chips' && (
                  <div className="chip-row">
                    {field.options.map((option) => (
                      <button
                        key={option}
                        className={`chip ${data[field.name] === option ? 'selected' : ''}`}
                        onClick={() => handleChipSelect(field.name, option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}

                {field.type === 'multicheck' && (
                  <div className="multicheck-group">
                    {field.options.map((option) => (
                      <label key={option.value} className="check-label">
                        <input
                          type="checkbox"
                          checked={Array.isArray(data[field.name]) && data[field.name].includes(option.value)}
                          onChange={() => handleMultiCheckChange(field.name, option.value)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                {field.type === 'text' && (
                  <input
                    type="text"
                    placeholder={field.placeholder}
                    value={data[field.name] || ''}
                    onChange={(e) => handleTextChange(field.name, e.target.value)}
                  />
                )}

                {field.type === 'textarea' && (
                  <textarea
                    placeholder={field.placeholder}
                    value={data[field.name] || ''}
                    onChange={(e) => handleTextChange(field.name, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="nav-btns">
          <div>
            <button className="btn btn-ghost" onClick={handlePrev} disabled={currentSection === 0}>
              ← Previous
            </button>
          </div>
          <div className="step-indicator">
            {currentSection + 1} / {sections.length}
          </div>
          <div>
            {currentSection === sections.length - 1 ? (
              <button className="btn btn-primary" onClick={handleUseGuide}>
                Use this style guide →
              </button>
            ) : (
              <button className="btn btn-primary" onClick={handleNext}>
                Next →
              </button>
            )}
          </div>
        </div>

        <button className="btn-close-panel" onClick={onCancel} title="Close panel">
          ✕
        </button>
      </div>
    </div>
  );
};

export default StyleGuidePanel;
