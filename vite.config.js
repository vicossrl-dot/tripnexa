import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { host: '127.0.0.1', port: 5173, strictPort: true,
      watch: { ignored: ['**/.local/**', '**/migration-backup/**', '**/base44/**', '**/server/**'] },
      proxy: { '/api': { target: 'http://127.0.0.1:' + (env.PORT || 3001), changeOrigin: true } },
      fs: { deny: ['.env', '.env.*', '**/.git/**', '**/server/**', '**/.local/**', '**/migration-backup/**', '**/base44/**'] },
    },
  };
});
