import './App.css';
import PDFViewer from './components/PDFViewer';
import CompareInterface from './components/CompareInterface';
import Torgman from './components/Torgman';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import posthog from './posthogConfig';
import ErrorBoundary from './components/ErrorBoundary';
import { trackComponentError } from './errorTracking';

const ARABIC_PDF_URL = '/static/MQM_study.pdf';
const ENGLISH_PDF_URL = '/static/MQM_study.pdf';

function App() {
  useEffect(() => {
    // Track app open on component mount
    posthog.capture('app_opened', {
      timestamp: new Date().toISOString(),
    });

    // Setup global error handler for unhandled promise rejections
    const handleUnhandledRejection = (event) => {
      trackComponentError(
        event.reason,
        'UnhandledPromiseRejection',
        'Unhandled promise rejection'
      );
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <ErrorBoundary name="App">
      <Router>
        <Routes>
          <Route path="/" element={<ErrorBoundary name="Torgman"><Torgman /></ErrorBoundary>} />
          <Route path="/compare" element={<ErrorBoundary name="CompareInterface"><CompareInterface /></ErrorBoundary>} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
