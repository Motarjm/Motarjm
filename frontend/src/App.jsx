import './App.css';
import PDFViewer from './components/PDFViewer';
import CompareInterface from './components/CompareInterface';
import EditingInterface from './components/EditingInterface';
import Torgman from './components/Torgman';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

const ARABIC_PDF_URL = '/static/MQM_study.pdf';
const ENGLISH_PDF_URL = '/static/MQM_study.pdf';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Torgman />} />
        <Route path="/editing" element={<EditingInterface />} />
        <Route path="/compare" element={<CompareInterface />} />
      </Routes>
    </Router>
  );
}

export default App;
