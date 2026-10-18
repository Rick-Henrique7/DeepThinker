// O que o site promete, e onde no código está a prova.
//
// Cada afirmação tem um `verificar()` que devolve uma lista de problemas:
//   erro(...)  -> o site diz algo que o app não faz (o vigia falha)
//   aviso(...) -> vale olhar, mas não quebra nada
//
// Quando você mudar um texto do site ou um recurso do app, é aqui que se ajusta.

import {
  existe, ehPasta, ler, json, achar, acharNaPasta,
  provedoresDoBackend, pom, dependencias,
} from './lib.mjs';

export const erro = (msg) => ({ nivel: 'erro', msg });
export const aviso = (msg) => ({ nivel: 'aviso', msg });

const REPO = 'https://github.com/Rick-Henrique7/DeepThinker';

// Nome que aparece no site -> id do provedor no PluginCatalog.java.
// O nome no site pode ser mais curto que o do app (ex.: "Mistral" e "Mistral AI").
const PROVEDORES_NO_SITE = {
  'OpenAI': 'openai',
  'Anthropic': 'anthropic',
  'Google Gemini': 'gemini',
  'Groq': 'groq',
  'OpenRouter': 'openrouter',
  'DeepSeek': 'deepseek',
  'Mistral': 'mistral',
  'Compatível com OpenAI': 'custom',
  'LM Studio (local)': 'lmstudio',
};

// Frases de recurso do site -> arquivo e padrão que provam que o app faz aquilo.
// Se a frase sumir do site, o vigia avisa para tirar a linha daqui também.
const RECURSOS = [
  { frase: 'Escreva [[Ideia]] e a nota se liga', prova: ['backend-java/src/main/java/com/deepthinker/note', /\[\[/] },
  { frase: 'Envie PDF, TXT ou Markdown', prova: ['backend-java/src/main/java/com/deepthinker/document/DocumentService.java', /List\.of\("pdf",\s*"txt",\s*"md"\)/] },
  { frase: 'o arquivo original não fica guardado', prova: ['backend-java/src/main/java/com/deepthinker/document/DocumentService.java', /getBytes\(\)|getInputStream\(\)/] },
  { frase: 'Um clique condensa uma nota longa', prova: ['backend-java/src/main/java/com/deepthinker/note/SummarizeService.java', /class SummarizeService/] },
  { frase: 'Login com JWT', prova: ['backend-java/src/main/java/com/deepthinker/auth/TokenService.java', /Jwt/] },
  { frase: 'dados separados por usuário', prova: ['backend-java/src/main/resources/db/migration', /user_id/] },
  { frase: 'criptografia AES-GCM', prova: ['backend-java/src/main/java/com/deepthinker/llm/SecretCipher.java', /AES\/GCM/] },
  { frase: 'Respostas em streaming', prova: ['backend-java/src/main/java/com/deepthinker/chat/ChatController.java', /SseEmitter/] },
  { frase: 'Consulta e cria notas sozinho (tool calling)', prova: ['backend-java/src/main/java/com/deepthinker/chat/ToolRegistry.java', /create_note|criar_nota|createNote/i] },
  { frase: 'Histórico de conversas salvo por sessão', prova: ['backend-java/src/main/java/com/deepthinker/conversation/ConversationMessage.java', /session_?[iI]d/] },
  { frase: 'fale pelo microfone', prova: ['frontend/src', /useSpeechToText\(/] },
  { frase: 'ele mesmo cria a nota e a liga ao grafo', prova: ['backend-java/src/main/java/com/deepthinker/chat/ToolRegistry.java', /create_note|criar_nota|createNote/i] },
];

// Termo da lista de tecnologias do site -> como conferir no código.
const STACK = {
  'React': () => 'react' in dependencias('frontend/package.json'),
  'TypeScript': () => 'typescript' in dependencias('frontend/package.json'),
  'Vite': () => 'vite' in dependencias('frontend/package.json'),
  'D3': () => 'd3' in dependencias('frontend/package.json'),
  'Java 21': () => pom('java.version') === '21',
  'Spring Boot': () => /spring-boot-starter-parent/.test(ler('backend-java/pom.xml')),
  'Flyway': () => /flyway/.test(ler('backend-java/pom.xml')),
  'PostgreSQL': () => /<artifactId>postgresql<\/artifactId>/.test(ler('backend-java/pom.xml')),
};

function provaExiste([rel, regex]) {
  if (!existe(rel)) return false;
  if (ehPasta(rel)) return acharNaPasta(rel, regex, ['.ts', '.tsx', '.java', '.sql']).length > 0;
  return regex.test(ler(rel));
}

export const afirmacoes = [
  {
    id: 'provedores',
    titulo: 'Provedores de IA do site = provedores do app',
    verificar({ site }) {
      const noSite = site.lista('providers');
      if (!noSite) return [erro('Não achei a lista <ul data-providers> no site.')];
      const noApp = provedoresDoBackend();
      const idsApp = new Set(noApp.map((p) => p.id));
      const problemas = [];
      const idsSite = new Set();
      for (const nome of noSite) {
        const id = PROVEDORES_NO_SITE[nome];
        if (!id) problemas.push(erro(`O site lista "${nome}", mas o vigia não sabe a qual provedor do app ele corresponde. Adicione em PROVEDORES_NO_SITE.`));
        else if (!idsApp.has(id)) problemas.push(erro(`O site lista "${nome}", mas o app não tem o provedor "${id}" (PluginCatalog.java).`));
        else idsSite.add(id);
      }
      for (const p of noApp) {
        if (!idsSite.has(p.id)) problemas.push(erro(`O app tem o provedor "${p.nome}" (${p.id}), mas o site não mostra.`));
      }
      return problemas;
    },
  },

  {
    id: 'recursos',
    titulo: 'Cada recurso prometido no site existe no código',
    verificar({ site }) {
      const problemas = [];
      for (const r of RECURSOS) {
        if (!site.texto.includes(r.frase)) {
          problemas.push(aviso(`A frase "${r.frase}" não está mais no site. Se foi de propósito, tire-a de RECURSOS em afirmacoes.mjs.`));
        } else if (!provaExiste(r.prova)) {
          problemas.push(erro(`O site diz "${r.frase}", mas não achei a prova em ${r.prova[0]} (${r.prova[1]}).`));
        }
      }
      return problemas;
    },
  },

  {
    id: 'upload',
    titulo: 'Tipos de arquivo: site, tela de upload e backend aceitam os mesmos',
    verificar() {
      const doBackend = achar('backend-java/src/main/java/com/deepthinker/document/DocumentService.java', /ALLOWED\s*=\s*List\.of\(([^)]*)\)/);
      if (!doBackend) return [erro('Não achei a lista ALLOWED em DocumentService.java.')];
      const backend = [...doBackend.matchAll(/"(\w+)"/g)].map((m) => m[1]).sort().join(',');
      const problemas = [];
      for (const arquivo of acharNaPasta('frontend/src', /accept="/, ['.tsx'])) {
        for (const m of ler(arquivo).matchAll(/accept="([^"]+)"/g)) {
          const tela = m[1].split(',').map((x) => x.trim().replace(/^\./, '')).sort().join(',');
          if (tela !== backend) problemas.push(erro(`${arquivo} aceita "${m[1]}", mas o backend aceita ${backend}.`));
        }
      }
      return problemas;
    },
  },

  {
    id: 'stack',
    titulo: 'Tecnologias citadas no site estão mesmo no projeto',
    verificar({ site }) {
      const pares = site.definicoes('stack');
      if (!pares) return [erro('Não achei a lista <dl class="stack"> no site.')];
      const problemas = [];
      for (const [area, valor] of Object.entries(pares)) {
        for (const termo of valor.split('·').map((t) => t.trim())) {
          const conferir = STACK[termo];
          if (!conferir) problemas.push(erro(`O site cita "${termo}" (${area}), mas o vigia não sabe conferir. Adicione em STACK.`));
          else if (!conferir()) problemas.push(erro(`O site cita "${termo}" (${area}), mas não está no projeto.`));
        }
      }
      if (pares.Banco === 'PostgreSQL' && /jdbc:h2/.test(ler('backend-java/src/main/resources/application.yml'))) {
        problemas.push(aviso('O site diz "Banco: PostgreSQL", mas quem roda local usa H2 por padrão (Postgres só em produção). Algo como "H2 local · PostgreSQL em produção" evita confusão.'));
      }
      return problemas;
    },
  },

  {
    id: 'instalacao',
    titulo: 'Os comandos do terminal do site funcionam no repositório',
    verificar({ site }) {
      const linhas = site.comandos();
      if (!linhas) return [erro('Não achei o bloco de terminal no site.')];
      // Simula um terminal: guarda a pasta atual e confere cada comando nela.
      const problemas = [];
      let pasta = null; // null = ainda fora do repositório
      for (const linha of linhas) {
        for (const cmd of linha.split('&&').map((c) => c.trim())) {
          const [prog, ...args] = cmd.split(/\s+/);
          const onde = pasta === null ? '(antes do clone)' : pasta || 'raiz';
          if (prog === 'git' && args[0] === 'clone') {
            if (args[1] !== REPO) problemas.push(erro(`O site clona "${args[1]}", mas o repositório é ${REPO}.`));
          } else if (prog === 'cd') {
            if (pasta === null) { pasta = ''; continue; } // cd DeepThinker entra na raiz
            const destino = pathJoin(pasta, args[0]);
            if (destino === null || !ehPasta(destino)) {
              problemas.push(erro(`"${cmd}" falha: a pasta "${destino ?? args[0]}" não existe a partir de ${onde}. Use um caminho a partir da raiz (ex.: cd ../frontend) ou diga para abrir outro terminal.`));
              return problemas; // o resto depende desta pasta
            }
            pasta = destino;
          } else if (prog.startsWith('./')) {
            const arq = pathJoin(pasta ?? '', prog.slice(2));
            if (!existe(arq)) problemas.push(erro(`"${cmd}" falha: ${arq} não existe.`));
          } else if (prog === 'npm') {
            const pkg = pathJoin(pasta ?? '', 'package.json');
            if (!existe(pkg)) { problemas.push(erro(`"${cmd}" falha: não há package.json em ${onde}.`)); continue; }
            if (args[0] === 'run' && !(args[1] in (json(pkg).scripts ?? {}))) {
              problemas.push(erro(`"${cmd}" falha: ${pkg} não tem o script "${args[1]}".`));
            }
          }
        }
      }
      if (linhas.some((l) => l.includes('./mvnw')) && !linhas.some((l) => l.includes('mvnw.cmd'))) {
        problemas.push(aviso('O site só mostra "./mvnw" (Linux/Mac). No Windows o comando é "mvnw.cmd spring-boot:run" ou ".\\mvnw spring-boot:run" no PowerShell.'));
      }
      return problemas;
    },
  },

  {
    id: 'links',
    titulo: 'Links do site funcionam',
    async verificar({ site, offline }) {
      const problemas = [];
      for (const href of new Set(site.links)) {
        if (href.startsWith('#')) {
          if (!site.ids.has(href.slice(1))) problemas.push(erro(`O link "${href}" aponta para uma seção que não existe.`));
        } else if (href.startsWith('http') && !offline) {
          try {
            const r = await fetch(href, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(10000) });
            if (!r.ok) problemas.push(erro(`O link ${href} respondeu ${r.status}${r.status === 404 && href.includes('github.com') ? ' (o repositório está privado ou não existe?)' : ''}.`));
          } catch (e) {
            problemas.push(aviso(`Não consegui abrir ${href} (${e.cause?.code ?? e.name}). Sem internet? Rode com --offline.`));
          }
        }
      }
      return problemas;
    },
  },

  {
    id: 'versoes',
    titulo: 'Backend, frontend e desktop usam a mesma versão',
    verificar() {
      const versoes = {
        'backend-java/pom.xml': achar('backend-java/pom.xml', /<artifactId>deepthinker-api<\/artifactId>\s*<version>([^<]+)</),
        'frontend/package.json': json('frontend/package.json').version,
      };
      if (existe('desktop/package.json')) versoes['desktop/package.json'] = json('desktop/package.json').version;
      if (existe('desktop/src-tauri/tauri.conf.json')) versoes['desktop/src-tauri/tauri.conf.json'] = json('desktop/src-tauri/tauri.conf.json').version;
      if (existe('desktop/src-tauri/Cargo.toml')) versoes['desktop/src-tauri/Cargo.toml'] = achar('desktop/src-tauri/Cargo.toml', /^version\s*=\s*"([^"]+)"/m);
      const distintas = new Set(Object.values(versoes));
      if (distintas.size <= 1) return [];
      const lista = Object.entries(versoes).map(([a, v]) => `${a}=${v}`).join(', ');
      return [erro(`As versões não batem: ${lista}. Escolha uma e use em todos.`)];
    },
  },

  {
    id: 'desktop',
    titulo: 'App desktop e site contam a mesma história',
    verificar({ site }) {
      if (!existe('desktop/src-tauri/tauri.conf.json')) return [];
      const conf = json('desktop/src-tauri/tauri.conf.json');
      const problemas = [];
      const marca = achar('site/index.html', /<title>([^<·|-]+)/)?.trim();
      if (marca && conf.productName !== marca) problemas.push(erro(`O desktop se chama "${conf.productName}", mas o site usa "${marca}".`));
      if (!/desktop|baixar|download|instalador|Windows/i.test(site.texto)) {
        problemas.push(aviso('Existe um app desktop (desktop/), mas o site ainda não fala dele nem tem link para baixar.'));
      }
      if (/roda no seu servidor/i.test(site.texto)) {
        problemas.push(aviso('O site diz "roda no seu servidor"; com o desktop, também roda direto no seu computador. Vale citar as duas formas.'));
      }
      return problemas;
    },
  },
];

// Junta caminhos relativos à raiz. Retorna null se sair do repositório.
function pathJoin(base, rel) {
  const partes = base ? base.split('/') : [];
  for (const p of rel.split('/')) {
    if (p === '' || p === '.') continue;
    if (p === '..') { if (!partes.length) return null; partes.pop(); }
    else partes.push(p);
  }
  return partes.join('/');
}
