import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';
import react from '@vitejs/plugin-react-swc';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mkcert()],
  server: {
    proxy: {
      '/v1': {
        target: 'https://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/v1/, '/api/v1'),
      },
    },
  },
});
