import React, { useState } from 'react';
import '../assets/search_tool_block.css';

// Collapsible "N pages searched" chip, used for surfacing web-search tool
// calls made by the LLM mid-stream. Renders a "searching…" state while the
// tool call is in flight, then a clickable "Searched N pages" summary that
// expands into the list of links once results arrive.
const SearchToolBlock = ({ status, urls = [], query }) => {
  const [open, setOpen] = useState(false);
  const isSearching = status === 'searching';

  return (
    <div className={`search-tool-block ${isSearching ? 'searching' : 'done'}`}>
      <button
        type="button"
        className="search-tool-summary"
        onClick={() => !isSearching && setOpen(o => !o)}
        disabled={isSearching}
        title={query || undefined}
      >
        {isSearching ? (
          <><span className="chip-spinner" /> Searching the web…</>
        ) : (
          <>
            🌐 Searched {urls.length} page{urls.length !== 1 ? 's' : ''}
            <span className="search-tool-caret">{open ? '▲' : '▼'}</span>
          </>
        )}
      </button>

      {open && !isSearching && (
        <ul className="search-tool-links">
          {urls.length === 0 && <li className="search-tool-empty">No results found.</li>}
          {urls.map((r, i) => (
            <li key={r.url || i}>
              <a href={r.url} target="_blank" rel="noopener noreferrer">
                {r.title || r.url}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SearchToolBlock;