// Contrôle par échantillon : les adresses construites selon le contrat
// (docs/CATALOGUE.md) répondent-elles par une image ?
//
//   node verifier-images.mjs [nombre par source]

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SORTIE, lireJson, chercher, journal } from './commun.mjs';

/** Même règle que l'application : largeur demandée L, plafonnée par `max`. */
export function urlImage(image, L) {
  const l = Math.min(L, image.max || Infinity, image.w || Infinity);
  switch (image.src) {
    case 'rijks': case 'aic': case 'nga': return `${image.iiif}/full/!${l},${l}/0/default.jpg`;
    case 'met': return l <= 1000 && image.petite ? image.petite : image.url;
    case 'commons': return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image.fichier)}?width=${l}`;
    case 'enwiki': return `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(image.fichier)}?width=${l}`;
    default: return null;
  }
}

const n = Number(process.argv[2] || 5);
const parSource = {};
const dossier = join(SORTIE, 'oeuvres');
for (const f of readdirSync(dossier).sort()) {
  for (const o of lireJson(join(dossier, f))) {
    (parSource[o.image.src] ||= []).push(o);
  }
}
for (const [src, liste] of Object.entries(parSource)) {
  // Échantillon réparti sur toute la liste, reproductible.
  const pas = Math.max(1, Math.floor(liste.length / n));
  for (let i = 0; i < liste.length && i / pas < n; i += pas) {
    const o = liste[i];
    const url = urlImage(o.image, 800);
    try {
      const r = await chercher(url, {}, 2);
      const type = r.headers.get('content-type');
      const taille = (await r.arrayBuffer()).byteLength;
      console.log(`${src.padEnd(8)} ${r.status} ${type} ${taille} o  ${o.titre.slice(0, 40)}  ${url.slice(0, 110)}`);
    } catch (e) {
      console.log(`${src.padEnd(8)} ERREUR ${e.message}  ${url}`);
    }
  }
}
journal('vérification terminée');
