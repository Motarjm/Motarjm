import React, { useState, useMemo } from 'react';
import { findMatchesClient } from '../utils/glossaryMatch';

const TermbaseTab = ({ glossary, activeSegmentSource }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const segmentMatches = useMemo(() => {
    if (!activeSegmentSource || !glossary) return [];
    return findMatchesClient(activeSegmentSource, glossary);
  }, [activeSegmentSource, glossary]);

  const filteredTerms = useMemo(() => {
    const entries = Object.entries(glossary || {});
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(
      ([src, tgt]) =>
        typeof src === 'string' &&
        typeof tgt === 'string' &&
        (src.toLowerCase().includes(q) || tgt.toLowerCase().includes(q))
    );
  }, [glossary, searchQuery]);

  return (
    <div className="termbase-panel">
      <input
        type="text"
        className="termbase-search-input"
        placeholder="Search terms…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {activeSegmentSource && segmentMatches.length > 0 && (
        <div className="termbase-section">
          <div className="termbase-section-label">Found in current segment</div>
          {segmentMatches.map(({ term, translation }) => (
            <div key={term} className="termbase-row">
              <span className="termbase-source">{term}</span>
              <span className="termbase-arrow">→</span>
              <span className="termbase-target">{translation}</span>
            </div>
          ))}
        </div>
      )}

      <div className="termbase-section">
        <div className="termbase-section-label">{searchQuery ? 'Search results' : 'All terms'}</div>
        {filteredTerms.length === 0 ? (
          <div className="tab-empty-state">No terms found.</div>
        ) : (
          filteredTerms.map(([src, tgt]) => (
            <div key={src} className="termbase-row">
              <span className="termbase-source">{src}</span>
              <span className="termbase-arrow">→</span>
              <span className="termbase-target">{tgt}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TermbaseTab;