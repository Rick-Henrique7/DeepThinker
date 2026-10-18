import type { PluginManifest } from './plugins';

/**
 * Plugins de exemplo, instaláveis com um clique na tela IA > Plugins.
 * Servem também de modelo para quem quer escrever o seu: é o mesmo formato do arquivo .json.
 */
export const PLUGIN_EXAMPLES: PluginManifest[] = [
  {
    id: 'contador-de-palavras',
    name: 'Contador de palavras',
    version: '1.0.0',
    author: 'Deep thinker',
    description: 'Conta palavras e tempo de leitura da nota aberta.',
    permissions: ['note:read', 'commands'],
    code: `deepthinker.registerCommand('contar', 'Contar palavras da nota aberta', async () => {
  const note = await deepthinker.getActiveNote();
  if (!note) return deepthinker.notify('Abra uma nota primeiro.');
  const texto = note.content.replace(/^---[\\s\\S]*?---/, '');
  const palavras = (texto.match(/\\S+/g) || []).length;
  const minutos = Math.max(1, Math.round(palavras / 200));
  deepthinker.notify('"' + note.title + '": ' + palavras + ' palavras, ~' + minutos + ' min de leitura.');
});`,
  },
  {
    id: 'carimbo-de-data',
    name: 'Carimbo de data',
    version: '1.0.0',
    author: 'Deep thinker',
    description: 'Insere a data e a hora de agora no editor da nota.',
    permissions: ['note:write', 'commands'],
    code: `deepthinker.registerCommand('agora', 'Inserir data e hora de agora', async () => {
  const d = new Date();
  const dois = (n) => String(n).padStart(2, '0');
  const texto = '**' + dois(d.getDate()) + '/' + dois(d.getMonth() + 1) + '/' + d.getFullYear() +
    ' ' + dois(d.getHours()) + ':' + dois(d.getMinutes()) + '** — ';
  await deepthinker.insertText(texto);
});`,
  },
  {
    id: 'modelo-de-reuniao',
    name: 'Modelo de reunião',
    version: '1.0.0',
    author: 'Deep thinker',
    description: 'Insere um roteiro de ata de reunião, com o título da nota.',
    permissions: ['note:read', 'note:write', 'commands'],
    code: `deepthinker.registerCommand('reuniao', 'Inserir modelo de reunião', async () => {
  const note = await deepthinker.getActiveNote();
  const titulo = note ? note.title : 'Reunião';
  await deepthinker.insertText([
    '## ' + titulo,
    '',
    '**Participantes:** ',
    '',
    '### Pauta',
    '- ',
    '',
    '### Decisões',
    '- ',
    '',
    '### Próximos passos',
    '- [ ] ',
  ].join('\\n'));
});`,
  },
];
