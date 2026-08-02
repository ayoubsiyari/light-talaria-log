import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { dukascopyApiPlugin } from './server/dukascopyPlugin';
import { talariaApiPlugin } from './server/apiPlugin';

/**
 * Always mount the disk `/api/v1` stub (dev + preview).
 * When TALARIA_API_PROXY is set, Vite's server.proxy takes precedence in `npm run saas:dev`.
 */
function saasProxyLogPlugin(proxyTarget: string | undefined): Plugin | null {
  if (!proxyTarget) return null;
  return {
    name: 'talaria-saas-proxy-log',
    configureServer() {
      console.log(`[saas] proxying /api/v1 → ${proxyTarget}`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = process.env.TALARIA_API_PROXY || env.TALARIA_API_PROXY || '';
  const proxyLog = saasProxyLogPlugin(proxyTarget || undefined);

  return {
    plugins: [
      react(),
      tailwindcss(),
      dukascopyApiPlugin(),
      talariaApiPlugin(),
      ...(proxyLog ? [proxyLog] : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@landing-content': path.resolve(__dirname, 'src/marketing-content'),
      },
    },
    server: {
      fs: {
        allow: [path.resolve(__dirname), path.resolve(__dirname, 'landing')],
      },
      proxy: proxyTarget
        ? {
            '/api/v1': {
              target: proxyTarget,
              changeOrigin: true,
            },
          }
        : undefined,
    },
    worker: {
      format: 'es',
    },
  };
});
