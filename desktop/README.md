# Deep thinker desktop

O mesmo Deep thinker, como programa instalável no Windows (e, com o mesmo código, Mac e Linux).

## Como funciona

```
Deep thinker.exe            janela feita com Tauri (Rust, ~100 linhas em src-tauri/src/main.rs)
 ├─ mostra o React de ../frontend (o mesmo da versão web)
 └─ sobe escondido o backend de ../backend-java:
      backend/runtime/bin/java.exe -jar backend/deepthinker-api.jar
        ├─ perfil Spring "desktop" (application-desktop.yml)
        ├─ só escuta em 127.0.0.1, numa porta livre sorteada a cada abertura
        └─ banco H2 em %APPDATA%\com.deepthinker.desktop\deepthinker.mv.db
```

Três ideias para entender:

1. **A janela não é um navegador inteiro.** O Tauri usa o WebView2, o "motor do Edge" que já vem no Windows. Por isso o instalador é pequeno comparado ao Electron, que leva um Chrome junto.
2. **O Java vai junto.** `scripts/build-backend.mjs` usa o `jlink` para recortar do seu JDK só os módulos que a API usa. Quem baixa o app não precisa instalar Java.
3. **Sem tela de login.** No PC há uma pessoa só. A cada abertura a janela sorteia uma chave, entrega ao Java (variável `DEEPTHINKER_DESKTOP_KEY`) e à página (`window.__DEEPTHINKER_DESKTOP__`). A página chama `POST /api/auth/local` com essa chave e entra na conta local. Outro programa do computador não sabe a chave, então não entra.

Quando a janela fecha (ou até se ela for morta pelo Gerenciador de Tarefas), o Java percebe pelo "cano" da entrada padrão e desliga sozinho, salvando o banco (`backend-java/.../desktop/ParentWatchdog.java`).

Os arquivos do usuário ficam em `%APPDATA%\com.deepthinker.desktop`: o banco, o `secret.key` (criptografa as chaves de IA salvas) e o `backend.log`, que é o primeiro lugar para olhar se algo der errado.

## O que instalar uma vez (Windows)

| Ferramenta | Para quê | Como |
|---|---|---|
| JDK 21 | compilar o backend e gerar o Java embutido | você já tem (Temurin 21) |
| Node 20+ | frontend e a CLI do Tauri | você já tem |
| Rust | compilar a janela | `winget install Rustlang.Rustup` |
| Visual Studio Build Tools, com "Desenvolvimento para desktop com C++" | o Rust usa o compilador da Microsoft no Windows | `winget install Microsoft.VisualStudio.2022.BuildTools`, marque o item no instalador |

O WebView2 já vem no Windows 10 e 11.

## Gerar o instalador

```powershell
cd C:\dev\projects\deepThinker\desktop
npm install
npm run build
```

O `npm run build` faz três coisas: compila o React (`npm run frontend`), compila o backend e gera o Java embutido (`npm run backend`), e monta o instalador (`tauri build`). A primeira vez demora alguns minutos porque o Rust compila tudo do zero.

O instalador sai em `src-tauri\target\release\bundle\nsis\Deep thinker_0.1.0_x64-setup.exe`. Ele instala só para o usuário atual (não pede administrador).

## Desenvolver com recarga automática

```powershell
npm run backend   # só precisa de novo quando mudar o Java
npm run dev       # abre a janela usando o Vite (localhost:5173): salvar um .tsx atualiza na hora
```

## Publicar para download

O workflow `.github/workflows/desktop.yml` monta o instalador no GitHub e cria um Release quando você envia uma tag:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

O botão **Baixar para Windows** do site aponta para `github.com/Rick-Henrique7/DeepThinker/releases/latest`.

## Para saber

- **Memória da IA:** na primeira abertura com internet, o backend baixa o modelo de busca por significado (multilingual-e5-small, ~120 MB) para `%APPDATA%\com.deepthinker.desktop\models`. Sem internet, a busca cai para palavras e o app segue funcionando. Esse recurso também deixou o instalador maior (o jar foi de ~65 MB para ~180 MB por causa do ONNX Runtime).
- **IA local volta a valer:** no desktop, o plugin LM Studio (ou Ollama, pelo "Personalizado") roda no seu PC, de graça e offline.
- **Ditado por voz:** o reconhecimento de voz do Chrome depende de servidores do Google e costuma não funcionar dentro do WebView2. Se o botão "Ditar" falhar no app, dá para trocar depois pelo Whisper (na nuvem ou local).
- **Aviso do Windows na primeira instalação:** sem certificado de assinatura de código, o SmartScreen mostra "O Windows protegeu o computador". O usuário clica em "Mais informações" e "Executar assim mesmo". Um certificado custa a partir de uns US$ 100 por ano; dá para decidir isso depois.
- **Mac e Linux:** o código é o mesmo. Basta adicionar `macos-latest` e `ubuntu-22.04` no workflow.
