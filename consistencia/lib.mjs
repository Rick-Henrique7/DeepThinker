// Ferramentas que as afirmações usam para ler o repositório.
// Só usa o que já vem com o Node (fs, path), então não precisa de `npm install`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A raiz do repositório é a pasta acima de consistencia/.
export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const caminho = (rel) => path.join(RAIZ, rel);
export const existe = (rel) => fs.existsSync(caminho(rel));
export const ehPasta = (rel) => existe(rel) && fs.statSync(caminho(rel)).isDirectory();
export const ler = (rel) => fs.readFileSync(caminho(rel), 'utf8');
export const json = (rel) => JSON.parse(ler(rel));

/** Procura um padrão num arquivo. Retorna o primeiro grupo capturado (ou o trecho todo). */
export function achar(rel, regex) {
  if (!existe(rel)) return null;
  const m = ler(rel).match(regex);
  return m ? (m[1] ?? m[0]) : null;
}

/** Procura um padrão em todos os arquivos de uma pasta (recursivo). Retorna os arquivos que casam. */
export function acharNaPasta(relPasta, regex, extensoes = ['.ts', '.tsx', '.java', '.js', '.mjs']) {
  const encontrados = [];
  const visitar = (rel) => {
    for (const item of fs.readdirSync(caminho(rel), { withFileTypes: true })) {
      if (item.name === 'node_modules' || item.name === 'dist' || item.name === 'target') continue;
      const filho = path.posix.join(rel, item.name);
      if (item.isDirectory()) visitar(filho);
      else if (extensoes.some((e) => item.name.endsWith(e)) && regex.test(ler(filho))) encontrados.push(filho);
    }
  };
  if (ehPasta(relPasta)) visitar(relPasta);
  return encontrados;
}

// ---------------------------------------------------------------------------
// Leitura do site. Um parser de HTML de verdade seria mais robusto, mas para uma
// página escrita à mão expressões regulares bastam e evitam dependências.
// ---------------------------------------------------------------------------

const ENTIDADES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
const decodificar = (s) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (e) => ENTIDADES[e]);
const semTags = (s) => decodificar(s.replace(/<[^>]*>/g, ''));
const limpar = (s) => semTags(s).replace(/\s+/g, ' ').trim();

export function lerSite(rel = 'site/index.html') {
  const html = ler(rel);
  const corpo = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  return {
    html,
    /** Todo o texto visível, numa linha só. */
    texto: limpar(corpo),
    /** Itens <li> da primeira lista que tem o atributo `data-<nome>`. */
    lista(nome) {
      const m = html.match(new RegExp(`<(ul|ol)[^>]*data-${nome}[^>]*>([\\s\\S]*?)</\\1>`));
      if (!m) return null;
      return [...m[2].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((x) => limpar(x[1]));
    },
    /** Pares termo/definição de <dl class="...nome...">, ex.: { Frontend: 'React · Vite' }. */
    definicoes(classe) {
      const m = html.match(new RegExp(`<dl[^>]*class="[^"]*${classe}[^"]*"[^>]*>([\\s\\S]*?)</dl>`));
      if (!m) return null;
      const pares = {};
      for (const x of m[1].matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)) pares[limpar(x[1])] = limpar(x[2]);
      return pares;
    },
    /** Linhas de comando ($ ...) do bloco de terminal, sem o "$ ". */
    comandos() {
      const m = html.match(/class="terminal"[\s\S]*?<pre><code>([\s\S]*?)<\/code><\/pre>/);
      if (!m) return null;
      return semTags(m[1])
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('$'))
        .map((l) => l.replace(/^\$\s*/, ''));
    },
    links: [...html.matchAll(/href="([^"]+)"/g)].map((m) => decodificar(m[1])),
    ids: new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])),
  };
}

// ---------------------------------------------------------------------------
// Leitura do app.
// ---------------------------------------------------------------------------

/** Provedores de IA cadastrados no backend: [{ id, nome, soDev }]. */
export function provedoresDoBackend() {
  const fonte = ler('backend-java/src/main/java/com/deepthinker/llm/PluginCatalog.java');
  // Cada provedor é um `add(new LlmPlugin("id", "Nome", ... , soDev));`
  return [...fonte.matchAll(/new LlmPlugin\("([^"]+)",\s*"([^"]+)"([\s\S]*?)\)\);/g)].map((m) => ({
    id: m[1],
    nome: m[2],
    soDev: /,\s*true\s*$/.test(m[3].trim()),
  }));
}

/** Um valor simples do pom.xml, ex.: pom('java.version'). */
export const pom = (tag) => achar('backend-java/pom.xml', new RegExp(`<${tag.replace('.', '\\.')}>([^<]+)</`));

/** Dependências (normais + dev) de um package.json. */
export function dependencias(rel) {
  const p = json(rel);
  return { ...(p.dependencies ?? {}), ...(p.devDependencies ?? {}) };
}
