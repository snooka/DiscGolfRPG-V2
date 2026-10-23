import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { en } from '../src/i18n/en.ts';
import { format, translate } from '../src/i18n/index.ts';

const SRC = path.join(import.meta.dirname, '..', 'src');
const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

// Alle t('…')-kall i koden + feilmeldinger som databasefunksjonene kaster (vises via t(message))
function usedKeys(): Map<string, string> {
  const keys = new Map<string, string>();
  const re = /\bt\(\s*'((?:\\.|[^'\\])*)'/g;
  for (const f of walk(SRC).filter((f) => /\.tsx?$/.test(f) && !/[/\\]i18n[/\\](en|index)\.ts$/.test(f))) {
    const s = fs.readFileSync(f, 'utf8');
    for (const m of s.matchAll(re)) keys.set(m[1].replace(/\\(['\\n])/g, (_x, c: string) => (c === 'n' ? '\n' : c)), path.relative(SRC, f));
  }
  const sql = fs.readFileSync(path.join(SRC, '..', 'supabase', 'schema.sql'), 'utf8');
  for (const m of sql.matchAll(/raise exception '([^']*)'/g)) keys.set(m[1], 'schema.sql');
  return keys;
}

const vars = (s: string): string => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('alle tekster i koden har en engelsk oversettelse', () => {
  const missing = [...usedKeys()].filter(([k]) => !(k in en)).map(([k, f]) => `${f}: ${k}`);
  assert.deepEqual(missing, [], `Mangler engelsk oversettelse:\n${missing.join('\n')}`);
});

test('ingen foreldede oversettelser i en.ts', () => {
  const used = usedKeys();
  const stale = Object.keys(en).filter((k) => !used.has(k));
  assert.deepEqual(stale, [], `Ubrukte nøkler i en.ts:\n${stale.join('\n')}`);
});

test('variablene {navn} er like i norsk og engelsk', () => {
  const bad = Object.entries(en).filter(([k, v]) => vars(k) !== vars(v)).map(([k]) => k);
  assert.deepEqual(bad, []);
});

test('engelsk tekst er ikke tom', () => {
  assert.deepEqual(Object.entries(en).filter(([, v]) => !v.trim()).map(([k]) => k), []);
});

test('translate: norsk er kilden, engelsk slår opp, ukjent faller tilbake til norsk', () => {
  assert.equal(translate('Venner', 'no'), 'Venner');
  assert.equal(translate('Venner', 'en'), 'Friends');
  assert.equal(translate('Finnes ikke i ordboken', 'en'), 'Finnes ikke i ordboken');
});

test('format fyller inn variabler og lar ukjente stå', () => {
  assert.equal(translate('Hull {n} av {total}', 'no', { n: 3, total: 18 }), 'Hull 3 av 18');
  assert.equal(translate('{name} • Hull {n} av {length}', 'en', { name: 'Normal Game', n: 3, length: 18 }), 'Normal Game • Hole 3 of 18');
  assert.equal(format('Hei {navn} {x}', { navn: 'Kim' }), 'Hei Kim {x}');
});

test('engelsk og norsk gir ulik tekst for en vanlig skjerm-tekst', () => {
  assert.notEqual(translate('Logg inn', 'en'), 'Logg inn');
});
