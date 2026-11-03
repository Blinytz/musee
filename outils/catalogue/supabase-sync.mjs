// Étape 5 : pousse dans Supabase l'index minimal du catalogue.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node supabase-sync.mjs
//   node supabase-sync.mjs --a-sec        compte ce qui partirait, sans réseau
//
// Table `musee_catalogue (id, niveau, prestige, support, musee)`. Rien d'autre
// du catalogue n'entre dans la base : son quota de 500 Mo est partagé par
// toutes les applications de l'écosystème.
//
// On lit d'abord ce que la base contient et on n'écrit QUE les lignes
// changées : réécrire 500 000 lignes identiques chaque mois laisserait autant
// de tuples morts, qui gonflent la table sans rien apporter. On ne supprime
// jamais une ligne : une œuvre sortie du catalogue peut être possédée.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SORTIE, lireJson, journal, chercher, lots } from './commun.mjs';
import { CONFIG } from '../../js/config.js';

export const CODES_SUPPORT = { peinture: 0, sculpture: 1, photographie: 2, estampe: 3 };

export function lignesCatalogue() {
  const dossier = join(SORTIE, 'oeuvres');
  const lignes = [];
  for (const f of readdirSync(dossier).filter((x) => x.endsWith('.json')).sort()) {
    for (const o of lireJson(join(dossier, f))) {
      lignes.push({
        id: o.id,
        niveau: o.niveau,
        prestige: CONFIG.niveaux[o.niveau].prestige,
        support: CODES_SUPPORT[o.support],
        musee: o.musee ?? null,
      });
    }
  }
  return lignes;
}

const egales = (a, b) => a.niveau === b.niveau && a.prestige === b.prestige && a.support === b.support && (a.musee ?? null) === (b.musee ?? null);

async function lignesDistantes(url, cle) {
  const existantes = new Map();
  let apres = -1;
  for (;;) {
    // Pagination par clé (id > dernier vu) : un décalage OFFSET ralentirait
    // chaque page et finit par expirer sur l'offre gratuite.
    const r = await chercher(`${url}/rest/v1/musee_catalogue?select=id,niveau,prestige,support,musee&id=gt.${apres}&order=id.asc&limit=1000`, {
      headers: { apikey: cle, Authorization: `Bearer ${cle}` },
    });
    if (!r.ok) throw new Error(`lecture HTTP ${r.status} ${await r.text()}`);
    const page = await r.json();
    for (const l of page) existantes.set(l.id, l);
    if (page.length < 1000) break;
    apres = page[page.length - 1].id;
  }
  return existantes;
}

export async function synchroniser({ aSec = false } = {}) {
  const lignes = lignesCatalogue();
  const url = process.env.SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (aSec || !url || !cle) {
    journal(`à sec : ${lignes.length} lignes, exemple ${JSON.stringify(lignes.slice(0, 2))}`);
    return { aEcrire: lignes.length, aSec: true };
  }
  const existantes = await lignesDistantes(url, cle);
  const aEcrire = lignes.filter((l) => !existantes.has(l.id) || !egales(l, existantes.get(l.id)));
  journal(`Supabase : ${existantes.size} lignes présentes, ${aEcrire.length} à écrire`);
  for (const lot of lots(aEcrire, 2000)) {
    const r = await chercher(`${url}/rest/v1/musee_catalogue?on_conflict=id`, {
      method: 'POST',
      headers: {
        apikey: cle,
        Authorization: `Bearer ${cle}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(lot),
    });
    if (!r.ok) throw new Error(`écriture HTTP ${r.status} ${await r.text()}`);
  }
  journal('Supabase : synchronisé');
  return { aEcrire: aEcrire.length };
}

if (process.argv[1]?.endsWith('supabase-sync.mjs')) await synchroniser({ aSec: process.argv.includes('--a-sec') });
