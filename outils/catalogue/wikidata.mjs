// Étape 1 : extraction Wikidata.
//
// Produit `cache/wikidata.json` : œuvres avec page fr ou en (liste blanche de
// classes), leurs artistes, les artistes de musée en général (pour les œuvres
// d'API sans page), les entités nommées (mouvements, pays, collections) et
// les musées classés (fréquentation annuelle renseignée).
//
// Une requête par propriété plutôt qu'une grande requête : les valeurs
// multiples (plusieurs créateurs, plusieurs dates) se multiplieraient entre
// elles et feraient exploser le nombre de lignes.

import { join } from 'node:path';
import { sparql, ecrireJson, lireJson, CACHE, ETAT, journal, codeWiki, lots } from './commun.mjs';
import { CLASSES, TOUTES_CLASSES, supportDe } from './classes.mjs';

const VALEURS_CLASSES = TOUTES_CLASSES.map((c) => `wd:${c}`).join(' ');

// Ensemble des œuvres retenues, réutilisé en sous-requête.
const OEUVRES = `{ SELECT DISTINCT ?w WHERE {
  VALUES ?cls { ${VALEURS_CLASSES} }
  ?w wdt:P31 ?cls .
  VALUES ?site0 { <https://en.wikipedia.org/> <https://fr.wikipedia.org/> }
  ?a0 schema:about ?w ; schema:isPartOf ?site0 .
} }`;

const CREATEURS = `{ SELECT DISTINCT ?h WHERE { ${OEUVRES} ?w wdt:P170 ?h . } }`;

// Artistes de musée : identifiants ULAN (P245), RKD (P650) ou ARTIC (P6295) avec une page fr
// ou en. Ce sont eux que les API de musées désignent ; il faut connaître leurs
// pages vues AVANT de traiter les dumps, faute de quoi un mois serait à refaire.
const ARTISTES_MUSEE = `{ SELECT DISTINCT ?h WHERE {
  { ?h wdt:P245 ?x . } UNION { ?h wdt:P650 ?y . } UNION { ?h wdt:P6295 ?z . }
  VALUES ?site1 { <https://en.wikipedia.org/> <https://fr.wikipedia.org/> }
  ?a1 schema:about ?h ; schema:isPartOf ?site1 .
} }`;

const MUSEES = `{ SELECT DISTINCT ?m WHERE { ?m wdt:P1174 ?v0 . ?m wdt:P31/wdt:P279* wd:Q33506 . } }`;

// Au-delà, aucun musée réel : ce sont des institutions entières (Smithsonian,
// 30 M) ou des sites touristiques. La Cité interdite plafonne vers 19 M.
export const FREQUENTATION_MAX = 20000000;

/**
 * La valeur la plus récente ne suffit pas : pour le Louvre comme pour le Met,
 * c'est 2021, année de fermetures (2,8 M au lieu de ~9 M), et le Musée royal
 * de l'Ontario porte une coquille à 281 M. On écarte donc 2020-2021 quand
 * d'autres années existent, puis les valeurs plus de 5 fois au-dessus ou en
 * dessous de la médiane du musée, puis on prend la plus récente (la plus
 * haute en cas d'égalité d'année).
 */
export function frequentation(releves) {
  let liste = releves.filter((r) => r.v <= FREQUENTATION_MAX);
  const horsFermetures = liste.filter((r) => r.annee !== 2020 && r.annee !== 2021);
  if (horsFermetures.length) liste = horsFermetures;
  if (liste.length >= 3) {
    const tri = liste.map((r) => r.v).sort((a, b) => a - b);
    const mediane = tri[Math.floor(tri.length / 2)];
    const sains = liste.filter((r) => r.v <= mediane * 5 && r.v >= mediane / 5);
    if (sains.length) liste = sains;
  }
  if (!liste.length) return null;
  // Sans date, une valeur ne détrône jamais une valeur datée.
  return liste.reduce((m, r) => ((r.annee ?? -1e9) > (m.annee ?? -1e9)
    || ((r.annee ?? -1e9) === (m.annee ?? -1e9) && r.v > m.v) ? r : m));
}

function ajouter(objet, cle, valeur) {
  if (valeur === undefined || valeur === null) return;
  (objet[cle] ||= []);
  if (!objet[cle].includes(valeur)) objet[cle].push(valeur);
}

async function liensWikipedia(ensemble, variable, etiquette) {
  const lignes = await sparql(`SELECT ?${variable} ?site ?titre WHERE { ${ensemble}
    ?a schema:about ?${variable} ; schema:isPartOf ?site ; schema:name ?titre .
    FILTER(CONTAINS(STR(?site), ".wikipedia.org/")) }`, { etiquette });
  const liens = {};
  for (const l of lignes) {
    const code = codeWiki(l.site);
    // Wikipédia abstraite n'est pas une encyclopédie lue : ses « pages » sont des QID.
    if (!code || code.startsWith('abstract.')) continue;
    (liens[l[variable]] ||= {})[code] = l.titre;
  }
  return liens;
}

async function libelles(ensemble, variable, etiquette) {
  const lignes = await sparql(`SELECT ?${variable} ?fr ?en WHERE { ${ensemble}
    OPTIONAL { ?${variable} rdfs:label ?fr FILTER(LANG(?fr) = "fr") }
    OPTIONAL { ?${variable} rdfs:label ?en FILTER(LANG(?en) = "en") } }`, { etiquette });
  const r = {};
  for (const l of lignes) {
    const e = (r[l[variable]] ||= {});
    if (l.fr) e.fr = l.fr;
    if (l.en) e.en = l.en;
  }
  return r;
}

export async function extraireWikidata() {
  const t0 = Date.now();
  const oeuvres = {};

  // Classes : le support se déduit de toutes les classes retenues de l'œuvre.
  for (const l of await sparql(`SELECT ?w ?cls WHERE { ${OEUVRES}
    VALUES ?cls { ${VALEURS_CLASSES} } ?w wdt:P31 ?cls . }`, { etiquette: 'classes' })) {
    ajouter((oeuvres[l.w] ||= {}), 'classes', l.cls);
  }
  for (const [q, o] of Object.entries(oeuvres)) o.support = supportDe(o.classes);

  const libO = await libelles(OEUVRES, 'w', 'libellés œuvres');
  for (const [q, l] of Object.entries(libO)) if (oeuvres[q]) Object.assign(oeuvres[q], l);

  const liensO = await liensWikipedia(OEUVRES, 'w', 'liens œuvres');
  for (const [q, l] of Object.entries(liensO)) if (oeuvres[q]) oeuvres[q].liens = l;

  for (const l of await sparql(`SELECT ?w ?h WHERE { ${OEUVRES} ?w wdt:P170 ?h . }`, { etiquette: 'créateurs' })) {
    if (oeuvres[l.w] && l.h.startsWith('Q')) ajouter(oeuvres[l.w], 'createurs', l.h);
  }

  // Dates avec leur précision : 7 = siècle, 8 = décennie, 9 = année.
  for (const l of await sparql(`SELECT ?w ?t ?prec WHERE { ${OEUVRES}
    ?w p:P571 ?st . ?st psv:P571 ?v . ?v wikibase:timeValue ?t ; wikibase:timePrecision ?prec . }`, { etiquette: 'dates' })) {
    if (oeuvres[l.w]) ajouter(oeuvres[l.w], 'dates', `${l.t}|${l.prec}`);
  }

  for (const [prop, cle] of [['P135', 'mouvements'], ['P495', 'pays']]) {
    for (const l of await sparql(`SELECT ?w ?x WHERE { ${OEUVRES} ?w wdt:${prop} ?x . }`, { etiquette: cle })) {
      if (oeuvres[l.w] && l.x.startsWith('Q')) ajouter(oeuvres[l.w], cle, l.x);
    }
  }

  // Collection actuelle : on écarte les déclarations closes par une date de
  // fin (ancien propriétaire, vente). Le parent P361 permet de remonter d'un
  // département (« Département des peintures du Louvre ») au musée.
  for (const l of await sparql(`SELECT ?w ?coll ?parent WHERE { ${OEUVRES}
    ?w p:P195 ?st . ?st ps:P195 ?coll . MINUS { ?st pq:P582 ?fin }
    OPTIONAL { ?coll wdt:P361 ?parent } }`, { etiquette: 'collections' })) {
    if (!oeuvres[l.w] || !l.coll.startsWith('Q')) continue;
    ajouter(oeuvres[l.w], 'collections', l.parent && l.parent.startsWith('Q') ? `${l.coll}>${l.parent}` : l.coll);
  }

  for (const [prop, cle] of [['P2048', 'hauteur'], ['P2049', 'largeur']]) {
    for (const l of await sparql(`SELECT ?w ?q ?u WHERE { ${OEUVRES}
      ?w p:${prop} ?st . ?st psv:${prop} ?v .
      ?v wikibase:quantityAmount ?q ; wikibase:quantityUnit ?u . }`, { etiquette: cle })) {
      if (oeuvres[l.w]) ajouter(oeuvres[l.w], cle, `${l.q}|${l.u}`);
    }
  }

  for (const [prop, cle] of [['P18', 'images'], ['P3634', 'met'], ['P4610', 'aic'], ['P4683', 'nga'], ['P13234', 'rijks']]) {
    for (const l of await sparql(`SELECT ?w ?x WHERE { ${OEUVRES} ?w wdt:${prop} ?x . }`, { etiquette: cle })) {
      if (!oeuvres[l.w]) continue;
      // P18 est une URI Special:FilePath ; on n'en garde que le nom de fichier.
      const v = prop === 'P18' ? decodeURIComponent(l.x.split('/Special:FilePath/')[1] || '').replace(/_/g, ' ') : l.x;
      if (v) ajouter(oeuvres[l.w], cle, v);
    }
  }

  // Artistes : créateurs des œuvres retenues, artistes de musée, et artistes
  // que les API ont cités le mois précédent sans qu'on les connaisse.
  const apiConnus = lireJson(join(ETAT, 'artistes-api.json'), []).filter((q) => /^Q\d+$/.test(q));
  const extra = apiConnus.length
    ? ` UNION { VALUES ?h { ${apiConnus.map((q) => `wd:${q}`).join(' ')} } }` : '';
  const ARTISTES = `{ SELECT DISTINCT ?h WHERE { { ${CREATEURS} } UNION { ${ARTISTES_MUSEE} }${extra} } }`;
  const artistes = {};
  const libA = await libelles(ARTISTES, 'h', 'libellés artistes');
  for (const [q, l] of Object.entries(libA)) if (q.startsWith('Q')) artistes[q] = { ...l };
  const liensA = await liensWikipedia(ARTISTES, 'h', 'liens artistes');
  for (const [q, l] of Object.entries(liensA)) if (artistes[q]) artistes[q].liens = l;
  for (const l of await sparql(`SELECT ?h ?pays WHERE { ${ARTISTES} ?h wdt:P27 ?pays . }`, { etiquette: 'nationalités' })) {
    if (artistes[l.h] && l.pays.startsWith('Q')) ajouter(artistes[l.h], 'pays', l.pays);
  }
  // Correspondances d'identifiants pour raccorder les artistes des API.
  for (const [prop, cle] of [['P245', 'ulan'], ['P650', 'rkd'], ['P6295', 'artic']]) {
    for (const l of await sparql(`SELECT ?h ?x WHERE { ${ARTISTES} ?h wdt:${prop} ?x . }`, { etiquette: cle })) {
      if (artistes[l.h]) ajouter(artistes[l.h], cle, l.x);
    }
  }

  // Musées classés : une fréquentation par musée, choisie par `frequentation`.
  const releves = {};
  for (const l of await sparql(`SELECT ?m ?v ?t WHERE { ${MUSEES}
    ?m p:P1174 ?st . ?st ps:P1174 ?v . OPTIONAL { ?st pq:P585 ?t } }`, { etiquette: 'fréquentations' })) {
    const annee = l.t ? Number(l.t.slice(0, l.t.indexOf('-', 1))) : null;
    const v = Math.round(Number(l.v));
    if (Number.isFinite(v) && v > 0) (releves[l.m] ||= []).push({ annee, v });
  }
  const musees = {};
  for (const [q, liste] of Object.entries(releves)) {
    const choix = frequentation(liste);
    if (choix) musees[q] = { visiteurs: choix.v, annee: choix.annee ?? null };
  }
  const libM = await libelles(MUSEES, 'm', 'libellés musées');
  for (const [q, l] of Object.entries(libM)) if (musees[q]) Object.assign(musees[q], l);
  for (const [prop, cle] of [['P131', 'lieu'], ['P17', 'pays']]) {
    for (const l of await sparql(`SELECT ?m ?x WHERE { ${MUSEES} ?m wdt:${prop} ?x . }`, { etiquette: `musées ${cle}` })) {
      if (musees[l.m] && l.x.startsWith('Q') && !musees[l.m][cle]) musees[l.m][cle] = l.x;
    }
  }

  // Libellés des entités citées (mouvements, pays, collections, lieux).
  const citees = new Set();
  for (const o of Object.values(oeuvres)) {
    for (const k of ['mouvements', 'pays']) for (const q of o[k] || []) citees.add(q);
    for (const c of o.collections || []) for (const q of c.split('>')) citees.add(q);
  }
  for (const a of Object.values(artistes)) for (const q of a.pays || []) citees.add(q);
  for (const m of Object.values(musees)) for (const k of ['lieu', 'pays']) if (m[k]) citees.add(m[k]);
  const entites = {};
  for (const lot of lots([...citees].sort(), 5000)) {
    const vals = lot.map((q) => `wd:${q}`).join(' ');
    Object.assign(entites, await libelles(`{ VALUES ?e { ${vals} } }`, 'e', `libellés entités (${lot.length})`));
  }

  const resultat = { genere: new Date().toISOString(), oeuvres, artistes, entites, musees };
  ecrireJson(join(CACHE, 'wikidata.json'), resultat);
  const parSupport = {};
  for (const o of Object.values(oeuvres)) parSupport[o.support] = (parSupport[o.support] || 0) + 1;
  journal(`Wikidata : ${Object.keys(oeuvres).length} œuvres`, parSupport,
    `${Object.keys(artistes).length} artistes, ${Object.keys(musees).length} musées, ${Object.keys(entites).length} entités, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return resultat;
}

if (process.argv[1]?.endsWith('wikidata.mjs')) {
  await extraireWikidata();
}

export { CLASSES };
