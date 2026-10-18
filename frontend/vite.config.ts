import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * O pdf.js (o leitor de PDF do Firefox, usado no Leitor) precisa de alguns arquivos de apoio
 * que ele busca sozinho, pelo endereço, só quando o PDF precisa:
 *   cmaps/          tabelas de caracteres (PDFs em chinês, japonês, coreano...)
 *   standard_fonts/ as fontes "padrão" que muitos PDFs usam sem trazer junto (Helvetica, Times...)
 *   wasm/           decodificadores de imagens de PDFs escaneados (JBIG2, JPEG 2000)
 *   iccs/           perfil de cor para PDFs em CMYK (gráfica)
 * Este plugin serve essas pastas em /pdfjs/ no "npm run dev" e as copia para o build,
 * sem precisar de outra dependência.
 */
function pdfjsAssets(): Plugin {
  const root = path.join(here, 'node_modules', 'pdfjs-dist');
  const dirs = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
  const skip = (name: string) => name.startsWith('quickjs'); // scripts dentro do PDF: o Leitor não roda
  const types: Record<string, string> = {
    '.wasm': 'application/wasm',
    '.js': 'text/javascript',
    '.icc': 'application/vnd.iccprofile',
  };
  return {
    name: 'pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const file = path.normalize(path.join(root, rel));
        const allowed = dirs.some((d) => file.startsWith(path.join(root, d) + path.sep));
        if (!allowed || skip(path.basename(file)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
        res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
      });
    },
    writeBundle(options) {
      const out = options.dir ?? path.join(here, 'dist');
      for (const d of dirs) {
        fs.cpSync(path.join(root, d), path.join(out, 'pdfjs', d), {
          recursive: true,
          filter: (src) => !skip(path.basename(src)),
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), pdfjsAssets()],
  // O Excalidraw (desenho) só é importado quando abre um desenho. Sem isto, no "npm run dev" o Vite
  // descobre a dependência nessa hora, refaz o pacote e recarrega a página (perdendo o desenho).
  optimizeDeps: {
    include: ['@excalidraw/excalidraw', 'yjs', 'y-protocols/awareness'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
