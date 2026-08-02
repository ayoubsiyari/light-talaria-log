import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initAppearance } from '@/chart/appearanceStore';
import { initTheme } from '@/theme/theme';
import './index.css';

initTheme();
initAppearance();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
