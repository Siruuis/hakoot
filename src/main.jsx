import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Play from './pages/Play.jsx';
import Library from './pages/Library.jsx';
import Editor from './pages/Editor.jsx';
import Host from './pages/Host.jsx';
import '@fontsource-variable/bricolage-grotesque';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/play" element={<Play />} />
        <Route path="/create" element={<Library />} />
        <Route path="/create/:id" element={<Editor />} />
        <Route path="/host" element={<Host />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
