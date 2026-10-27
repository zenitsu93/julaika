import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// Filet de sécurité iOS : maximum-scale=1 empêche le zoom automatique sur un champ trop petit,
// et Safari laisse quand même zoomer au pincement. Pas sur Android, où il bloquerait le pincement.
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const viewport = document.querySelector<HTMLMetaElement>('meta[name=viewport]');
if (ios && viewport) viewport.content += ', maximum-scale=1';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
