import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configEffective } from '../js/config.js';
import { simuler } from '../outils/simulation.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

function fichiers(dossier, extensions) {
  const r = [];
  for (const n of readdirSync(join(RACINE, dossier))) {
    const p = join(dossier, n);
    if (statSync(join(RACINE, p)).isDirectory()) r.push(...fichiers(p, extensions));
    else if (extensions.some((e) => n.endsWith(e))) r.push(p);
  }
  return r;
}

test('aucun tiret long dans les textes visibles (chaînes de l\'interface)', () => {
  const interdits = /[—–−]/;
  for (const f of [...fichiers('js', ['.js']), 'index.html', 'manifest.json', 'sw.js', 'supabase/source/musee.js']) {
    const lignes = readFileSync(join(RACINE, f), 'utf8').split('\n');
    lignes.forEach((l, i) => {
      // Les commentaires sont invisibles : seules les chaînes comptent.
      const code = l.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
      const chaines = code.match(/(['"`])(?:\\.|(?!\1).)*\1/g) || [];
      for (const c of chaines) assert.ok(!interdits.test(c), `${f}:${i + 1} ${c}`);
    });
  }
});

test('le service worker ne met en cache que des fichiers qui existent', () => {
  const sw = readFileSync(join(RACINE, 'sw.js'), 'utf8');
  const liste = sw.slice(sw.indexOf('const FICHIERS = ['), sw.indexOf('];', sw.indexOf('const FICHIERS = [')));
  for (const [, f] of liste.matchAll(/'\.\/([^']*)'/g)) {
    if (!f || f.startsWith('catalogue/')) continue;
    assert.ok(existsSync(join(RACINE, f)), f);
  }
  for (const f of fichiers('js', ['.js'])) {
    assert.ok(sw.includes(`'./${f.replace(/\\/g, '/')}'`), `absent du service worker : ${f}`);
  }
});

test('le service worker ne supprime que ses propres caches (origine partagée)', () => {
  const sw = readFileSync(join(RACINE, 'sw.js'), 'utf8');
  assert.match(sw, /c\.startsWith\(PREFIXE\)/);
});

test('équilibrage : à partir du statut national, à moins de 10 % des repères de la spec', async () => {
  // Sans cambriolage : un vol tiré au mauvais moment déplacerait les délais
  // de quelques jours sans rien dire de l'équilibrage.
  const cfg = configEffective({ securite: { menaces: { nuit: { max: 0, min: 0 }, jour: { max: 0, min: 0 }, vandalisme: { max: 0, min: 0 } } } });
  const reperes = { 3: [5, 3.5, 2.7].map((m) => m * 30.44), 4: [17, 10, 8].map((m) => m * 30.44), 5: [2.6, 1.6, 1.1].map((a) => a * 365) };
  for (const [k, h] of [2, 3, 4].entries()) {
    const r = await simuler(cfg, h);
    for (const s of [3, 4, 5]) {
      const ecart = r.atteints[s].jours / reperes[s][k] - 1;
      assert.ok(Math.abs(ecart) <= 0.10, `${h} h/jour, statut ${s} : ${Math.round(ecart * 100)} %`);
    }
  }
});
