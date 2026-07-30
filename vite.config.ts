import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { dukascopyApiPlugin } from './server/dukascopyPlugin';
import { talariaApiPlugin } from './server/apiPlugin';

export default defineConfig({
  plugins: [react(), tailwindcss(), dukascopyApiPlugin(), talariaApiPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@landing-content': path.resolve(__dirname, 'landing/src/content'),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname), path.resolve(__dirname, 'landing')],
    },
  },
  worker: {
    format: 'es',
  },
});
