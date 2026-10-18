#!/usr/bin/env node
// Vigia de consistência do Deep thinker.
//
// Uso (da raiz do repositório):
//   node consistencia/verificar.mjs            # confere tudo, inclusive os links na internet
//   node consistencia/verificar.mjs --offline  # pula os links externos
//   node consistencia/verificar.mjs --estrito  # avisos também fazem falhar
//
// Sai com código 1 se houver erro. É isso que faz o GitHub Actions marcar o push em vermelho.

import { afirmacoes } from './afirmacoes.mjs';
import { lerSite } from './lib.mjs';

const args = new Set(process.argv.slice(2));
const offline = args.has('--offline');
const estrito = args.has('--estrito');

// Cores só quando a saída é um terminal (no CI e em arquivos fica texto puro).
const cor = process.stdout.isTTY && !process.env.NO_COLOR;
const pinta = (codigo) => (s) => (cor ? `\x1b[${codigo}m${s}\x1b[0m` : s);
const verde = pinta(32), vermelho = pinta(31), amarelo = pinta(33), cinza = pinta(90), negrito = pinta(1);

const ctx = { site: lerSite(), offline };

let erros = 0;
let avisos = 0;

console.log(negrito('\nVigia de consistência · site × app × desktop\n'));

for (const a of afirmacoes) {
  let problemas;
  try {
    problemas = await a.verificar(ctx);
  } catch (e) {
    problemas = [{ nivel: 'erro', msg: `A própria checagem quebrou: ${e.message}` }];
  }
  const e = problemas.filter((p) => p.nivel === 'erro');
  const w = problemas.filter((p) => p.nivel === 'aviso');
  erros += e.length;
  avisos += w.length;

  const icone = e.length ? vermelho('✗') : w.length ? amarelo('!') : verde('✓');
  console.log(`${icone} ${a.titulo} ${cinza(`[${a.id}]`)}`);
  for (const p of e) console.log(`    ${vermelho('erro')}  ${p.msg}`);
  for (const p of w) console.log(`    ${amarelo('aviso')} ${p.msg}`);
}

const resumo = `${afirmacoes.length} checagens · ${erros} erro(s) · ${avisos} aviso(s)${offline ? ' · links externos pulados' : ''}`;
console.log(`\n${erros ? vermelho(resumo) : avisos ? amarelo(resumo) : verde(resumo)}\n`);

process.exit(erros || (estrito && avisos) ? 1 : 0);
