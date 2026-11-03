// Outils partagés par les étapes du pipeline : chemins, accès réseau poli et
// résistant, SPARQL, lecture et écriture JSON.

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ICI = dirname(fileURLToPath(import.meta.url));
export const RACINE = join(ICI, '..', '..');
// `cache/` : données brutes, régénérables, jamais commitées.
// `etat/` : ce qui doit survivre d'un mois à l'autre (ids, pages vues), commité.
export const CACHE = join(ICI, 'cache');
export const ETAT = join(ICI, 'etat');
export const SORTIE = join(RACINE, 'catalogue');

export const UA = 'MuseeEclats/1.0 (https://github.com/Blinytz/musee; catalogue mensuel)';

export const SUPPORTS = ['peinture', 'sculpture', 'photographie', 'estampe'];

export function lireJson(chemin, defaut) {
  if (!existsSync(chemin)) return defaut;
  return JSON.parse(readFileSync(chemin, 'utf8'));
}

/** Écriture atomique : un pipeline interrompu ne laisse jamais un JSON tronqué. */
export function ecrireJson(chemin, valeur, indent = 0) {
  mkdirSync(dirname(chemin), { recursive: true });
  const tmp = `${chemin}.tmp`;
  writeFileSync(tmp, JSON.stringify(valeur, null, indent || undefined));
  renameSync(tmp, chemin);
}

export const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export function journal(...args) {
  const h = new Date().toISOString().slice(11, 19);
  console.error(`[${h}]`, ...args);
}

/**
 * fetch avec reprises : les API de musées et Wikimedia renvoient des 429 et
 * des 5xx passagers, et une seule erreur ne doit pas faire tomber un build
 * de plusieurs heures.
 */
export async function chercher(url, options = {}, essais = 6) {
  let attente = 2000;
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, {
        ...options,
        headers: { 'User-Agent': UA, ...(options.headers || {}) },
        signal: AbortSignal.timeout(options.delai || 120000),
      });
      if (r.status === 429 || r.status >= 500) {
        const apres = Number(r.headers.get('retry-after')) * 1000;
        throw Object.assign(new Error(`HTTP ${r.status}`), { attente: apres || 0 });
      }
      return r;
    } catch (e) {
      if (i + 1 >= essais) throw e;
      await dormir(Math.max(attente, e.attente || 0));
      attente *= 2;
    }
  }
}

export async function chercherJson(url, options) {
  const r = await chercher(url, options);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url.slice(0, 160)}`);
  return r.json();
}

const PREFIXES = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>
PREFIX psv: <http://www.wikidata.org/prop/statement/value/>
PREFIX pq: <http://www.wikidata.org/prop/qualifier/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX schema: <http://schema.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;

const QLEVER = 'https://qlever.cs.uni-freiburg.de/api/wikidata';
const WDQS = 'https://query.wikidata.org/sparql';

/**
 * Requête SPARQL. QLever d'abord : il répond en secondes là où le service
 * officiel expire à 60 s sur les jointures avec les liens de sites. Le
 * service officiel reste un repli pour les petites requêtes.
 */
let derniereRequete = 0;

export async function sparql(corps, { etiquette = '' } = {}) {
  const requete = PREFIXES + corps;
  // Les réponses du jour sont gardées sur disque : une reprise après panne ne
  // repose pas trente requêtes, et QLever répond 429 si on l'enchaîne trop vite.
  const cle = createHash('sha1').update(requete).digest('hex').slice(0, 16);
  const fichier = join(CACHE, 'sparql', `${new Date().toISOString().slice(0, 10)}-${cle}.json`);
  const deja = lireJson(fichier, null);
  if (deja) { journal(`sparql ${etiquette} : ${deja.length} lignes (cache)`); return deja; }

  for (let tour = 0; tour < 4; tour++) {
    for (const point of [QLEVER, WDQS]) {
      try {
        const pause = 4000 - (Date.now() - derniereRequete);
        if (pause > 0) await dormir(pause);
        derniereRequete = Date.now();
        const t = Date.now();
        const r = await chercher(point, {
          method: 'POST',
          headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ query: requete }),
          delai: 600000,
        }, 3);
        const texte = await r.text();
        if (!r.ok) throw new Error(`HTTP ${r.status} ${texte.slice(0, 300)}`);
        const lignes = JSON.parse(texte).results.bindings.map((b) => {
          const o = {};
          for (const [k, v] of Object.entries(b)) o[k] = v.type === 'uri' ? v.value.replace('http://www.wikidata.org/entity/', '') : v.value;
          return o;
        });
        journal(`sparql ${etiquette} : ${lignes.length} lignes en ${((Date.now() - t) / 1000).toFixed(1)} s (${point === QLEVER ? 'QLever' : 'WDQS'})`);
        ecrireJson(fichier, lignes);
        return lignes;
      } catch (e) {
        journal(`sparql ${etiquette} échec sur ${point} : ${e.message.slice(0, 200)}`);
      }
    }
    // Les deux services refusent : on laisse QLever souffler avant un nouveau tour.
    await dormir(60000 * (tour + 1));
  }
  throw new Error(`SPARQL impossible : ${etiquette}`);
}

/** Cadence partagée : au plus `parSeconde` départs de requêtes par seconde. */
export function cadence(parSeconde) {
  let prochain = 0;
  return async () => {
    const maintenant = Date.now();
    const depart = Math.max(maintenant, prochain);
    prochain = depart + 1000 / parSeconde;
    if (depart > maintenant) await dormir(depart - maintenant);
  };
}

/** Découpe un tableau en lots. */
export function lots(tableau, taille) {
  const r = [];
  for (let i = 0; i < tableau.length; i += taille) r.push(tableau.slice(i, i + taille));
  return r;
}

/** Exécute `fn` sur chaque élément avec au plus `n` appels simultanés. */
export async function parallele(elements, n, fn) {
  let i = 0;
  const res = new Array(elements.length);
  await Promise.all(Array.from({ length: Math.min(n, elements.length) }, async () => {
    while (i < elements.length) {
      const k = i++;
      res[k] = await fn(elements[k], k);
    }
  }));
  return res;
}

/** « https://en.wikipedia.org/ » → « en.wikipedia », le code des dumps de pages vues. */
export function codeWiki(site) {
  const m = /^https?:\/\/([^/]+)\.wikipedia\.org\/?$/.exec(site);
  return m ? `${m[1]}.wikipedia` : null;
}

export function assurerDossier(d) { mkdirSync(d, { recursive: true }); return d; }
