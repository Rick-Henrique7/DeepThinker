# Site do Deep thinker

Página de apresentação do Deep thinker (landing page). É um projeto separado do app:
não usa nada de `frontend/` nem de `backend-java/`.

## Rodar no seu computador

```bash
cd site
npm install
npm run dev      # abre em http://localhost:5173
npm run build    # gera a versão final em site/dist
npm run preview  # serve a versão final para conferir
```

## Por que foi feito assim

**Vite sem React.** O site é uma página só, quase toda texto e animação. React traria
~45 KB e um passo de renderização a mais sem ganho nenhum. Com HTML + JavaScript puro o
texto aparece na hora, o que ajuda o Google (SEO) e a primeira impressão.

**As bibliotecas vêm do npm, não de CDN.** O Vite empacota tudo junto do site. Assim ele
não depende de outro servidor estar no ar, e o navegador baixa menos coisa.

**Quem anima o quê:**

| Biblioteca | Onde | Por quê |
|---|---|---|
| three.js | `src/graph.js`, grafo 3D do topo | É a forma mais direta de desenhar milhares de pontos e linhas na GPU (WebGL). |
| GSAP + ScrollTrigger | `src/main.js`, entrada do título e tudo ligado à rolagem | O ScrollTrigger amarra uma animação à posição da rolagem (`scrub`) com muita precisão. |
| anime.js | `src/main.js`, digitação da IA, mini grafo, chips dos provedores | A função `stagger()` facilita animar muitos elementos em sequência (letra por letra, "a partir do centro"). |

O three.js é carregado com `import()` dinâmico, então ele vira um arquivo à parte: o texto
da página não espera os ~130 KB do 3D chegarem.

**Princípios de animação (Emil Kowalski / animations.dev):**
- Curva `ease-out` forte para coisas que entram (`--ease-out` em `styles.css`).
- Só animar `transform` e `opacity`, que o navegador desenha sem recalcular o layout.
- Nunca crescer a partir de `scale(0)`: começamos em 0.4 ou 0.96, parece mais físico.
- Botões encolhem para `scale(0.97)` ao clicar (feedback tátil).
- Hover só em aparelhos com mouse (`@media (hover: hover)`).
- Quem ativou "reduzir movimento" no sistema vê a página sem as animações grandes.

**Identidade visual.** Mesma base do app (fundo preto, tipografia limpa) com um único azul
de destaque, tirado do orbe do chat. Fontes: Geist (texto), Instrument Serif itálica
(destaques) e Geist Mono (código), todas servidas pelo próprio site via `@fontsource`.

O orbe ao lado da resposta da IA usa o mesmo shader "Flowing Waves" do app
(`frontend/src/lib/shaders.ts`).

## Publicar

A pasta `dist/` é um site estático. Na Vercel: importe o repositório, defina **Root
Directory** = `site`, e ela detecta o Vite sozinha (build `npm run build`, saída `dist`).
Netlify, Cloudflare Pages e GitHub Pages funcionam do mesmo jeito.

## Onde mudar as coisas

- Textos: `index.html`
- Cores, fontes, espaçamentos: variáveis no topo de `src/styles.css`
- Grafo 3D (quantidade de nós, cores, velocidade): `src/graph.js`
- Animações: `src/main.js`, uma seção comentada por bloco da página

## Publicar na Vercel

O site já está pronto para a Vercel (`vercel.json` nesta pasta).

1. Entre em vercel.com com a sua conta do GitHub e clique em **Add New > Project**.
2. Escolha o repositório `DeepThinker`.
3. Em **Root Directory**, escolha `site` (o site é uma pasta dentro do repositório).
4. Clique em **Deploy**. A Vercel lê o `vercel.json`, roda `npm ci` e `npm run build`
   e publica a pasta `dist` num endereço `*.vercel.app`.

A cada `git push` na branch principal a Vercel publica de novo sozinha.

**O que o `vercel.json` faz:**
- `cleanUrls`: o Guia abre em `/docs` em vez de `/docs.html`.
- Cache de 1 ano para `/assets/`: o Vite põe um código no nome de cada arquivo
  (`main-a1b2c3.js`). Se o arquivo muda, o nome muda, então o navegador pode guardar
  o antigo para sempre sem risco de mostrar versão velha.
- Cache de 1 semana para `/video/`: esses nomes não mudam, então o prazo é menor.
- Três cabeçalhos de segurança simples (o site não usa câmera, microfone nem localização).

**O vídeo** fica em `public/video/` em duas versões, 720p (3,5 MB) e 1080p (6,4 MB).
A página só baixa o poster; o vídeo começa a baixar quando alguém clica em assistir.
