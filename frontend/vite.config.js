import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Everything, including the /api/events Server-Sent Events stream,
      // goes to the Go backend. SSE is ordinary HTTP, so one rule covers it
      // — the old separate /socket.io websocket rule is no longer needed.
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    }
  },
  define: {
    'process.env': {}
  }
});
