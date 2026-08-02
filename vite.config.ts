import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { dukascopyApiPlugin } from './server/dukascopyPlugin';
import { talariaApiPlugin } from './server/apiPlugin';

/**
 * When TALARIA_API_PROXY is set, /api/v1 → Level-2 Fastify API.
 * Otherwise keep the local disk stub plugin (zero-Docker chart work).
 */
function saasApiPlugins(proxyTarget: string | undefined): Plugin[] {
  if (proxyTarget) {
    return [
      {
        name: 'talaria-saas-proxy-log',
        configureServer() {
          console.log(`[saas] proxying /api/v1 → ${proxyTarget}`);
        },
      },
    ];
  }
  return [talariaApiPlugin()];
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = process.env.TALARIA_API_PROXY || env.TALARIA_API_PROXY || '';

  return {
    plugins: [
      react(),
      tailwindcss(),
      dukascopyApiPlugin(),
      ...saasApiPlugins(proxyTarget || undefined),
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
