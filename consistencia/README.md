# Vigia de consistência

Confere se o **site** (`site/`) promete só o que o **app** (`frontend/` + `backend-java/`) e o
**desktop** (`desktop/`) realmente fazem.

```bash
node consistencia/verificar.mjs            # tudo, inclusive links na internet
node consistencia/verificar.mjs --offline  # sem acessar a internet
node consistencia/verificar.mjs --estrito  # avisos também fazem falhar
```

Não precisa de `npm install`: usa só o que já vem com o Node (18 ou mais novo).

## A ideia

O código é a fonte da verdade. Cada frase do site que promete alguma coisa fica ligada, em
`afirmacoes.mjs`, ao arquivo que prova essa promessa. O script lê os dois lados e compara.

- **erro**: o site diz algo que o app não faz. O script sai com código 1, e no GitHub Actions o push fica vermelho.
- **aviso**: vale olhar, mas não quebra nada (ex.: uma frase saiu do site e a regra ficou sobrando).

## O que ele confere

| Checagem | Site | Prova no código |
|---|---|---|
| `provedores` | lista "Plugins de IA" | `PluginCatalog.java` |
| `recursos` | frases da seção Recursos, Advogado e "Como funciona" | services, controllers, migrations, hooks do React |
| `upload` | "PDF, TXT ou Markdown" | `DocumentService.ALLOWED` e os `accept=` das telas |
| `stack` | "React · Vite · Java 21 ..." | `frontend/package.json`, `pom.xml` |
| `instalacao` | bloco do terminal | simula os `cd`, `./mvnw` e `npm run` e vê se as pastas e scripts existem |
| `links` | todos os `href` | âncoras existem; links externos respondem 200 |
| `versoes` | | `pom.xml`, `package.json` do frontend e do desktop, `tauri.conf.json`, `Cargo.toml` |
| `desktop` | nome e menções | `tauri.conf.json` |

## Quando mudar alguma coisa

- **Mudou um texto do site?** Se o vigia avisar que uma frase sumiu, atualize `RECURSOS` em `afirmacoes.mjs`.
- **Novo provedor de IA?** Adicione no `PluginCatalog.java`, no site, e o nome em `PROVEDORES_NO_SITE`.
- **Nova tecnologia no site?** Ensine o vigia a conferir em `STACK`.
- **Nova checagem?** Crie um objeto `{ id, titulo, verificar() }` em `afirmacoes` que devolva `erro(...)` ou `aviso(...)`.

## Limite

Ele só confere o que está listado. Uma frase nova no site que ninguém ligou ao código passa
despercebida. Para isso fica a camada com IA (uma rotina do Claude que lê tudo e procura
contradições), planejada para depois.
