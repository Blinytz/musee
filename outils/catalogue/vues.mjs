// Étape 2 : pages vues d'un mois, tirées du dump mensuel de Wikimedia.
//
//   node vues.mjs 2026-10            un mois
//   node vues.mjs --manquants 2      les 12 derniers mois absents, 2 à la fois
//
// Le dump (`pageview_complete/monthly/*-user.bz2`, ~6 Go compressés, ~35 Go
// de texte) est lu EN FLUX : curl | bzip2 -dc | ce script. Rien de géant ne
// touche le disque. Chaque ligne donne « wiki titre id accès total horaires » ;
// on ne garde que les pages des œuvres et artistes suivis, toutes langues,
// tous accès confondus, et on somme par entité Wikidata.
//
// Le résultat `etat/vues/AAAA-MM.json` est commité : la mise à jour mensuelle
// ne télécharge que le nouveau mois. Les entités suivies valant 0 y figurent
// aussi, pour distinguer « aucune vue » de « pas encore suivie ».

import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { CACHE, ETAT, lireJson, ecrireJson, journal, UA } from './commun.mjs';

const DUMPS = 'https://dumps.wikimedia.org/other/pageview_complete/monthly';

/** Clé de recherche : « en.wikipedia Mona_Lisa », en latin1 des octets UTF-8. */
function cle(code, titre) {
  return Buffer.from(`${code} ${titre.replace(/ /g, '_')}`, 'utf8').toString('latin1');
}

export function tableTitres(wd) {
  const table = new Map();
  for (const groupe of [wd.oeuvres, wd.artistes]) {
    for (const [q, e] of Object.entries(groupe)) {
      for (const [code, titre] of Object.entries(e.liens || {})) table.set(cle(code, titre), q);
    }
  }
  return table;
}

function decompresseur() {
  // lbzip2 décompresse en parallèle sur les runners GitHub ; bzip2 sinon.
  const ok = spawnSync('bash', ['-c', 'command -v lbzip2'], { encoding: 'utf8' });
  return ok.status === 0 && ok.stdout.trim() ? 'lbzip2 -dc -n 4' : 'bzip2 -dc';
}

export function moisPrecedents(n, depuis = new Date()) {
  // Le dump d'un mois paraît le 1er du mois suivant vers 5 h UTC.
  const r = [];
  const d = new Date(Date.UTC(depuis.getUTCFullYear(), depuis.getUTCMonth(), 1));
  for (let i = 1; i <= n; i++) {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    r.push(`${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return r;
}

export function traiterMois(mois, table, existant = null) {
  const [a, m] = mois.split('-');
  const url = `${DUMPS}/${a}/${mois}/pageviews-${a}${m}-user.bz2`;
  // VUES_COMMANDE permet de tester le filtre sur un extrait local.
  const commande = process.env.VUES_COMMANDE || `curl -sSf --retry 5 --retry-delay 30 -A "${UA}" "${url}" | ${decompresseur()}`;
  journal(`${mois} : lecture de ${url}`);
  const t0 = Date.now();
  const totaux = new Map();
  for (const q of new Set(table.values())) totaux.set(q, 0);

  return new Promise((resolve, reject) => {
    const proc = spawn('bash', ['-o', 'pipefail', '-c', commande], { stdio: ['ignore', 'pipe', 'inherit'] });
    let reste = '';
    let lignes = 0;
    let octets = 0;
    let dernierJournal = Date.now();
    proc.stdout.on('data', (morceau) => {
      octets += morceau.length;
      const texte = reste + morceau.toString('latin1');
      let debut = 0;
      for (;;) {
        const fin = texte.indexOf('\n', debut);
        if (fin < 0) break;
        lignes++;
        // Filtre rapide : seules les Wikipédia nous intéressent.
        const e1 = texte.indexOf(' ', debut);
        if (e1 > 0 && e1 < fin && texte.startsWith('.wikipedia', e1 - 10)) {
          const e2 = texte.indexOf(' ', e1 + 1);
          if (e2 > 0 && e2 < fin) {
            const q = table.get(texte.slice(debut, e2));
            if (q) {
              // Champs suivants : id de page, type d'accès, total du mois.
              const e3 = texte.indexOf(' ', e2 + 1);
              const e4 = texte.indexOf(' ', e3 + 1);
              const e5 = texte.indexOf(' ', e4 + 1);
              const n = Number(texte.slice(e4 + 1, e5 > 0 && e5 < fin ? e5 : fin));
              if (Number.isFinite(n)) totaux.set(q, totaux.get(q) + n);
            }
          }
        }
        debut = fin + 1;
      }
      reste = texte.slice(debut);
      if (Date.now() - dernierJournal > 60000) {
        dernierJournal = Date.now();
        journal(`${mois} : ${(octets / 1e9).toFixed(1)} Go lus, ${(lignes / 1e6).toFixed(0)} M lignes`);
      }
    });
    proc.on('close', (code) => {
      // Un flux coupé laisserait un mois sous-compté sans que rien ne le
      // signale : seul un code de sortie nul valide le mois.
      if (code !== 0) { reject(new Error(`${mois} : flux interrompu (code ${code}) après ${(octets / 1e9).toFixed(1)} Go`)); return; }
      // En complément, les entités déjà comptées ce mois-là sont conservées.
      const tout = existant ? [...Object.entries(existant.entites), ...totaux.entries()] : [...totaux.entries()];
      const entites = Object.fromEntries(tout.sort(([x], [y]) => Number(x.slice(1)) - Number(y.slice(1))));
      const resultat = { mois, genere: new Date().toISOString(), lignes, octets, suivies: Object.keys(entites).length, entites };
      ecrireJson(join(ETAT, 'vues', `${mois}.json`), resultat);
      journal(`${mois} : terminé en ${((Date.now() - t0) / 60000).toFixed(1)} min, ${(octets / 1e9).toFixed(1)} Go, ${totaux.size} entités suivies`);
      resolve(resultat);
    });
  });
}

async function principal() {
  const args = process.argv.slice(2);
  // Pour la matrice de l'Action : la liste des mois à traiter, en JSON.
  if (args[0] === '--liste-manquants') {
    console.log(JSON.stringify(moisPrecedents(12).filter((x) => !existsSync(join(ETAT, 'vues', `${x}.json`)))));
    return;
  }
  const wd = lireJson(join(CACHE, 'wikidata.json'));
  if (!wd) throw new Error('cache/wikidata.json manquant : lancer wikidata.mjs d\'abord');
  const table = tableTitres(wd);
  journal(`${table.size} pages suivies`);
  // Complément : relit un mois déjà traité pour les seules entités apparues
  // depuis (nouvelles œuvres, artistes cités par les API). Elles n'auront que
  // ce mois-là, ramené à 12 par la construction.
  if (args[0] === '--completer') {
    const x = args[1];
    const existant = lireJson(join(ETAT, 'vues', `${x}.json`));
    if (!existant) throw new Error(`${x} n'a pas encore été traité`);
    const reduite = new Map([...table].filter(([, q]) => !(q in existant.entites)));
    journal(`${x} : complément pour ${new Set(reduite.values()).size} entités`);
    if (reduite.size) await traiterMois(x, reduite, existant);
    return;
  }
  let mois;
  let simultanes = 1;
  if (args[0] === '--manquants') {
    simultanes = Number(args[1] || 2);
    mois = moisPrecedents(12).filter((x) => !existsSync(join(ETAT, 'vues', `${x}.json`)));
  } else mois = args;
  journal(`mois à traiter : ${mois.join(', ') || 'aucun'}`);
  const file = [...mois];
  const echecs = [];
  await Promise.all(Array.from({ length: Math.min(simultanes, file.length) }, async () => {
    while (file.length) {
      const x = file.shift();
      for (let essai = 1; essai <= 3; essai++) {
        try { await traiterMois(x, table); break; } catch (e) {
          journal(e.message);
          if (essai === 3) echecs.push(x);
        }
      }
    }
  }));
  if (echecs.length) { journal(`échecs : ${echecs.join(', ')}`); process.exitCode = 1; }
}

if (process.argv[1]?.endsWith('vues.mjs')) await principal();
