import React, { useState, useEffect, useRef } from 'react';
import { API_URL } from '../apiConfig';
import '../assets/translation_memory.css';

const scoreClass = (score) => {
  if (score >= 95) return 'tm-score-high';
  if (score >= 75) return 'tm-score-mid';
  return 'tm-score-low';
};

const TranslationMemoryTab = ({ tmId, activeSegmentSource, segmentMatches, loadingSegment }) => {
  const [manualQuery, setManualQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const debounceRef = useRef(null);

  const runSearch = async (query, setter, setLoading, mode = 'token') => {
    if (!tmId || !query || !query.trim()) {
      setter([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/translation/tm/search?tm_id=${encodeURIComponent(tmId)}&query=${encodeURIComponent(query)}&top_k=5&mode=${mode}`
      );
      if (!res.ok) throw new Error('TM search failed');
      const data = await res.json();
      setter(data.matches || []);
    } catch (e) {
      console.warn('TM search error:', e);
      setter([]);
    } finally {
      setLoading(false);
    }
  };

  // debounced manual search (char-based: literal character-level match)
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(manualQuery, setSearchMatches, setLoadingSearch, 'char');
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [manualQuery, tmId]);

  const renderRow = (m, i) => (
    <div key={i} className="tm-row">
      <div className={`tm-score-badge ${scoreClass(m.score)}`}>{Math.round(m.score)}%</div>
      <div className="tm-row-text">
        <div className="tm-row-source">{m.source}</div>
        <div className="tm-row-target">{m.target}</div>
      </div>
    </div>
  );

  return (
    <div className="tm-panel">
      <input
        type="text"
        className="tm-search-input"
        placeholder="Search translation memory…"
        value={manualQuery}
        onChange={(e) => setManualQuery(e.target.value)}
      />

      {activeSegmentSource && (
        <div className="tm-section">
          <div className="tm-section-label">Matches for current segment</div>
          {loadingSegment ? (
            <div className="tab-empty-state">Searching…</div>
          ) : segmentMatches.length === 0 ? (
            <div className="tab-empty-state">No matches found.</div>
          ) : (
            segmentMatches.map(renderRow)
          )}
        </div>
      )}

      {manualQuery.trim() && (
        <div className="tm-section">
          <div className="tm-section-label">Search results</div>
          {loadingSearch ? (
            <div className="tab-empty-state">Searching…</div>
          ) : searchMatches.length === 0 ? (
            <div className="tab-empty-state">No matches found.</div>
          ) : (
            searchMatches.map(renderRow)
          )}
        </div>
      )}
    </div>
  );
};

export default TranslationMemoryTab;