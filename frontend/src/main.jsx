import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initPostHog } from './posthogConfig';

// Initialize PostHog before rendering the app
initPostHog();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
