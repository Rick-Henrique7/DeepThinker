import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // O chunk do three.js passa de 500 KB sem compressão (132 KB com gzip). É esperado.
    chunkSizeWarningLimit: 600,
    // Duas páginas: a inicial e o Guia. O Vite gera um HTML para cada uma.
    rollupOptions: {
      input: {
        main: 'index.html',
        docs: 'docs.html',
      },
    },
  },
});
