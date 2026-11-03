// Téléchargement et lecture en flux des CSV ouverts (NGA, Met).
//
// Lecteur maison plutôt qu'une dépendance : les champs entre guillemets y
// contiennent des retours à la ligne (provenances, inscriptions), ce qui
// interdit de couper ligne à ligne.

import { createReadStream, existsSync, statSync, createWriteStream, renameSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { CACHE, chercher, journal, assurerDossier } from './commun.mjs';

/** Télécharge une fois par jour ; renvoie le chemin local. */
export async function telechargerCsv(url, nom) {
  const chemin = join(assurerDossier(join(CACHE, 'csv')), nom);
  if (existsSync(chemin) && Date.now() - statSync(chemin).mtimeMs < 20 * 3600 * 1000) return chemin;
  journal(`téléchargement ${nom}`);
  const r = await chercher(url, { delai: 1800000 });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(`${chemin}.part`));
  renameSync(`${chemin}.part`, chemin);
  journal(`${nom} : ${(statSync(chemin).size / 1e6).toFixed(0)} Mo`);
  return chemin;
}

/** Itère les lignes d'un CSV comme objets { colonne: valeur }. */
export async function* lireCsv(chemin) {
  let entetes = null;
  let champ = '';
  let ligne = [];
  let guillemets = false;
  let precedentGuillemet = false;
  for await (const morceau of createReadStream(chemin, { encoding: 'utf8', highWaterMark: 1 << 20 })) {
    for (let i = 0; i < morceau.length; i++) {
      const c = morceau[i];
      if (guillemets) {
        if (c === '"') { guillemets = false; precedentGuillemet = true; } else champ += c;
        continue;
      }
      if (c === '"') {
        // Un guillemet doublé à l'intérieur d'un champ cité vaut un guillemet.
        if (precedentGuillemet) champ += '"';
        guillemets = true;
        precedentGuillemet = false;
        continue;
      }
      precedentGuillemet = false;
      if (c === ',') { ligne.push(champ); champ = ''; continue; }
      if (c === '\r') continue;
      if (c === '\n') {
        ligne.push(champ); champ = '';
        if (!entetes) entetes = ligne.map((x) => x.replace(/^﻿/, '').trim());
        else if (ligne.length > 1 || ligne[0] !== '') {
          const o = {};
          for (let k = 0; k < entetes.length; k++) o[entetes[k]] = ligne[k] ?? '';
          yield o;
        }
        ligne = [];
        continue;
      }
      champ += c;
    }
  }
  if (champ !== '' || ligne.length) {
    ligne.push(champ);
    if (entetes) {
      const o = {};
      for (let k = 0; k < entetes.length; k++) o[entetes[k]] = ligne[k] ?? '';
      yield o;
    }
  }
}
