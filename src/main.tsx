import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toast } from '@heroui/react';
import App from './App';
import { AuthProvider } from '@/auth/AuthContext';
import { initAppearance } from '@/chart/appearanceStore';
import { installTimezoneManager } from '@/chart/timezone';
import { initTheme } from '@/theme/theme';
import { installForbidNativeTooltips } from '@/v9/forbidNativeTooltips.js';
import './index.css';
/* V9 Obsidian chrome — scoped to [data-v9-app] (see chrome-tokens.css) */
import '@/v9/chrome.css';
import '@/v9/chrome-icon-align.css';

initTheme();
initAppearance();
installTimezoneManager();
installForbidNativeTooltips(document);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Toast.Provider placement="top end" maxVisibleToasts={3} />
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
