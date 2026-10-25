import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'desktop-csp',
      transformIndexHtml(html, ctx) {
        return ctx.server
          ? html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
          : html;
      },
    },
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@lezer/cpp') || id.includes('@codemirror/lang-cpp')) return 'c-language';
          if (id.includes('@codemirror') || id.includes('/codemirror/') || id.includes('@lezer'))
            return 'code-editor';
          if (id.includes('/jszip/')) return 'archive';
        },
      },
    },
  },
  base: './',
  server: { host: '127.0.0.1', port: 5192, strictPort: true },
});
