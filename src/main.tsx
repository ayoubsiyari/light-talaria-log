import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toast } from '@heroui/react';
import App from './App';
import { AuthProvider } from '@/auth/AuthContext';
import { initAppearance } from '@/chart/appearanceStore';
import { initTheme } from '@/theme/theme';
import './index.css';

initTheme();
initAppearance();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Toast.Provider placement="top end" maxVisibleToasts={3} />
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
