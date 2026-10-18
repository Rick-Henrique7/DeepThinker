/**
 * Prepara o backend Java para ir dentro do instalador.
 *
 * Resultado em src-tauri/resources/backend/:
 *   deepthinker-api.jar   o Spring Boot de ../backend-java, num arquivo só
 *   runtime/              um Java mínimo (só os módulos que a API usa), feito com jlink
 *
 * Por que levar um Java junto? Assim quem baixa o app não precisa instalar Java.
 * O jlink corta o JDK inteiro (~300 MB) para só o necessário (~50 MB).
 *
 * Precisa de: JDK 21 ou mais novo (JAVA_HOME apontando para ele, ou java no PATH).
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const backendSrc = resolve(here, '../../backend-java');
const out = resolve(here, '../src-tauri/resources/backend');
const windows = process.platform === 'win32';

/** Ferramenta do JDK: usa JAVA_HOME se existir, senão a do PATH. */
function jdkTool(name) {
  const exe = windows ? `${name}.exe` : name;
  const fromHome = process.env.JAVA_HOME && join(process.env.JAVA_HOME, 'bin', exe);
  return fromHome && existsSync(fromHome) ? fromHome : name;
}

function run(cmd, args, cwd, { shell = false } = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  // shell só para o mvnw.cmd (arquivo .cmd no Windows). Para o java e o jlink, sem shell:
  // com shell, um caminho com espaço (C:\Program Files\...) quebra em dois.
  return execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], shell, encoding: 'utf8' });
}

// 1. Compila o backend num jar só (testes ficam para o "mvnw test").
console.log('1/3 Compilando o backend Java...');
// Caminho completo: o Windows pode estar configurado para não procurar programas na pasta atual
// (NoDefaultCurrentDirectoryInExePath), e aí só "mvnw.cmd" não é encontrado.
run(windows ? join(backendSrc, 'mvnw.cmd') : './mvnw', ['-q', '-DskipTests', 'package'], backendSrc, { shell: windows });
const jar = readdirSync(join(backendSrc, 'target')).find(
  (f) => f.startsWith('deepthinker-api-') && f.endsWith('.jar') && !f.endsWith('.original'),
);
if (!jar) throw new Error('Não achei o jar em backend-java/target.');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyFileSync(join(backendSrc, 'target', jar), join(out, 'deepthinker-api.jar'));

// 2. Módulos do Java que o Spring Boot, o H2 e o PDFBox usam.
//    Filtramos pelos que existem no seu JDK (alguns somem entre versões).
const wanted = [
  'java.base', 'java.compiler', 'java.desktop', 'java.instrument', 'java.logging',
  'java.management', 'java.naming', 'java.net.http', 'java.prefs', 'java.rmi',
  'java.scripting', 'java.security.jgss', 'java.security.sasl', 'java.sql',
  'java.transaction.xa', 'java.xml', 'jdk.charsets', 'jdk.crypto.ec', 'jdk.localedata',
  'jdk.management', 'jdk.net', 'jdk.unsupported', 'jdk.zipfs',
];
const available = new Set(
  run(jdkTool('java'), ['--list-modules'])
    .split(/\r?\n/)
    .map((line) => line.split('@')[0].trim())
    .filter(Boolean),
);
const modules = wanted.filter((m) => available.has(m));

// 3. Gera o Java mínimo.
console.log('2/3 Gerando o Java embutido com jlink...');
run(jdkTool('jlink'), [
  '--add-modules', modules.join(','),
  '--include-locales', 'pt-BR,en',
  '--strip-debug', '--no-header-files', '--no-man-pages',
  '--output', join(out, 'runtime'),
]);

console.log(`3/3 Pronto: ${out}`);
