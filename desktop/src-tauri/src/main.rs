// Deep thinker desktop.
//
// Este programa faz só três coisas:
//   1. sobe o backend Java (Spring Boot) escondido, numa porta livre do computador;
//   2. abre uma janela que mostra o frontend React;
//   3. desliga o backend quando a janela fecha.
//
// Todo o resto (notas, grafo, IA) continua no React e no Java, igual à versão web.

// Em release, não abre aquela janela preta de terminal junto com o app no Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

/// Guarda o processo do Java para conseguirmos desligá-lo no final.
struct Backend(Mutex<Option<Child>>);

/// Pede ao sistema uma porta livre: abrir na porta 0 faz o sistema escolher uma.
fn free_port() -> std::io::Result<u16> {
    Ok(TcpListener::bind("127.0.0.1:0")?.local_addr()?.port())
}

/// Segredo desta instalação: criptografa as API keys salvas e assina o login.
/// Gerado na primeira abertura e guardado na pasta de dados, para valer nas próximas.
fn install_secret(data_dir: &Path) -> std::io::Result<String> {
    let file = data_dir.join("secret.key");
    if let Ok(saved) = fs::read_to_string(&file) {
        if !saved.trim().is_empty() {
            return Ok(saved.trim().to_string());
        }
    }
    let secret = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    fs::write(&file, &secret)?;
    Ok(secret)
}

/// No Windows, o Tauri devolve caminhos no formato "\\?\C:\...". O Windows aceita,
/// mas o Java não: com esse prefixo ele abre o .jar e não acha a classe principal.
/// Aqui tiramos o prefixo e voltamos ao caminho normal "C:\...".
fn plain_path(path: PathBuf) -> PathBuf {
    match path.to_str().and_then(|p| p.strip_prefix(r"\\?\")) {
        Some(rest) if !rest.starts_with("UNC") => PathBuf::from(rest),
        _ => path,
    }
}

/// Monta o comando que roda o backend com o Java que vai dentro do instalador.
/// Os arquivos vêm de desktop/scripts/build-backend.mjs (pasta resources/backend).
fn backend_command(backend_dir: &Path, data_dir: &Path, port: u16, key: &str) -> Result<Command, Box<dyn std::error::Error>> {
    let java = backend_dir
        .join("runtime")
        .join("bin")
        .join(if cfg!(windows) { "java.exe" } else { "java" });
    let jar = backend_dir.join("deepthinker-api.jar");
    if !java.exists() || !jar.exists() {
        return Err(format!(
            "Backend não encontrado em {}. Rode \"npm run backend\" na pasta desktop.",
            backend_dir.display()
        )
        .into());
    }

    // A saída do Java vai para um arquivo: é o primeiro lugar para olhar se algo der errado.
    let log = fs::File::create(data_dir.join("backend.log"))?;

    let mut cmd = Command::new(java);
    cmd.arg("-Xmx512m")
        .arg("-jar")
        .arg(jar)
        .env("SPRING_PROFILES_ACTIVE", "desktop")
        .env("PORT", port.to_string())
        .env("DEEPTHINKER_DATA_DIR", data_dir)
        .env("DEEPTHINKER_SECRET", install_secret(data_dir)?)
        .env("DEEPTHINKER_DESKTOP_KEY", key)
        // Cano na entrada do Java: se este app morrer, o cano fecha e o Java desliga sozinho.
        .env("DEEPTHINKER_WATCH_STDIN", "true")
        .stdin(Stdio::piped())
        .current_dir(data_dir)
        .stdout(log.try_clone()?)
        .stderr(log);

    // No Windows, CREATE_NO_WINDOW impede que o Java abra um terminal.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    Ok(cmd)
}

/// Desliga o Java com educação: fecha o cano da entrada (o ParentWatchdog do Spring
/// percebe e encerra salvando o banco). Se em 10 segundos ele não sair, força.
fn stop_backend(mut child: Child) {
    drop(child.stdin.take());
    for _ in 0..100 {
        if let Ok(Some(_)) = child.try_wait() {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn main() {
    let app = tauri::Builder::default()
        .setup(|app| {
            // Pasta de dados do usuário. No Windows: %APPDATA%\com.deepthinker.desktop
            let data_dir: PathBuf = plain_path(app.path().app_data_dir()?);
            fs::create_dir_all(&data_dir)?;

            let backend_dir = plain_path(app.path().resource_dir()?).join("backend");
            let port = free_port()?;
            // Chave de uso único: só esta janela consegue entrar na conta local.
            let key = Uuid::new_v4().simple().to_string();

            let child = backend_command(&backend_dir, &data_dir, port, &key)?.spawn()?;
            app.manage(Backend(Mutex::new(Some(child))));

            // Roda antes do React: é assim que ele descobre onde está a API (frontend/src/lib/desktop.ts).
            let init = format!(
                "window.__DEEPTHINKER_DESKTOP__ = {{ apiUrl: 'http://127.0.0.1:{port}/api', key: '{key}' }};"
            );
            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Deep thinker")
                .inner_size(1280.0, 820.0)
                .min_inner_size(900.0, 600.0)
                .initialization_script(&init)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("não foi possível iniciar o Deep thinker");

    app.run(|handle, event| {
        // Janela fechou: desliga o Java junto, senão ele ficaria rodando escondido.
        if let RunEvent::Exit = event {
            if let Some(state) = handle.try_state::<Backend>() {
                if let Some(child) = state.0.lock().unwrap().take() {
                    stop_backend(child);
                }
            }
        }
    });
}
