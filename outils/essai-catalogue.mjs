#!/usr/bin/env node
// Mini-catalogue d'essai (quelques centaines d'œuvres célèbres, niveaux tirés
// du nombre de langues) pour tester l'interface sans le pipeline complet.
// Sortie : outils/essai-catalogue/, au format de docs/CATALOGUE.md.
//
//   node outils/essai-catalogue.mjs
//   puis ouvrir l'application avec ?demo&catalogue=outils/essai-catalogue/

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../js/config.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(ICI, 'essai-catalogue');
const UA = 'MuseeEclats/0.1 (https://github.com/Blinytz; essai)';

async function sparql(q, essai = 0) {
  const r = await fetch('https://qlever.cs.uni-freiburg.de/api/wikidata', {
    method: 'POST',
    headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ query: q }),
  });
  if (!r.ok) {
    if (essai < 3) { await new Promise((ok) => setTimeout(ok, 4000)); return sparql(q, essai + 1); }
    throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
  }
  return (await r.json()).results.bindings;
}

const PREFIXES = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX schema: <http://schema.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>`;

const SUPPORTS = { peinture: 'wd:Q3305213', sculpture: 'wd:Q860861', photographie: 'wd:Q125191', estampe: 'wd:Q18219090' };
const LIMITES = { peinture: 260, sculpture: 70, photographie: 50, estampe: 60 };

const q = (id) => id.replace('http://www.wikidata.org/entity/', '');
const oeuvres = [];
for (const [support, classe] of Object.entries(SUPPORTS)) {
  const lignes = await sparql(`${PREFIXES}
SELECT ?w ?n ?img ?lfr ?len ?cr ?crfr ?cren ?an ?mv ?mvfr ?py ?pyfr ?col ?colfr ?colen ?frt ?ent WHERE {
  ?w wdt:P31 ${classe} ; wdt:P18 ?img ; wikibase:sitelinks ?n .
  OPTIONAL { ?w rdfs:label ?lfr FILTER(LANG(?lfr) = "fr") }
  OPTIONAL { ?w rdfs:label ?len FILTER(LANG(?len) = "en") }
  OPTIONAL { ?w wdt:P170 ?cr . OPTIONAL { ?cr rdfs:label ?crfr FILTER(LANG(?crfr) = "fr") } OPTIONAL { ?cr rdfs:label ?cren FILTER(LANG(?cren) = "en") } }
  OPTIONAL { ?w wdt:P571 ?d BIND(YEAR(?d) AS ?an) }
  OPTIONAL { ?w wdt:P135 ?mv . ?mv rdfs:label ?mvfr FILTER(LANG(?mvfr) = "fr") }
  OPTIONAL { ?w wdt:P495 ?py . ?py rdfs:label ?pyfr FILTER(LANG(?pyfr) = "fr") }
  OPTIONAL { ?w wdt:P195 ?col . OPTIONAL { ?col rdfs:label ?colfr FILTER(LANG(?colfr) = "fr") } OPTIONAL { ?col rdfs:label ?colen FILTER(LANG(?colen) = "en") } }
  OPTIONAL { ?a1 schema:about ?w ; schema:isPartOf <https://fr.wikipedia.org/> ; schema:name ?frt }
  OPTIONAL { ?a2 schema:about ?w ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?ent }
  FILTER(?n >= 8)
} ORDER BY DESC(?n) LIMIT ${LIMITES[support] * 3}`);
  const vus = new Map();
  for (const b of lignes) {
    const id = q(b.w.value);
    if (vus.has(id)) continue;
    vus.set(id, {
      q: id,
      n: Number(b.n.value),
      titre: b.lfr?.value || b.len?.value || id,
      titreEn: b.len?.value,
      artiste: b.cr ? { q: q(b.cr.value), nom: b.crfr?.value || b.cren?.value || '?' } : undefined,
      an: b.an ? Number(b.an.value) : undefined,
      mouvement: b.mv && b.mvfr ? { q: q(b.mv.value), nom: b.mvfr.value } : undefined,
      pays: b.py && b.pyfr ? { q: q(b.py.value), nom: b.pyfr.value } : undefined,
      collection: b.col ? { q: q(b.col.value), nom: b.colfr?.value || b.colen?.value || '?' } : undefined,
      fichier: decodeURIComponent(b.img.value.split('/').pop()).replace(/_/g, ' '),
      wiki: { fr: b.frt?.value, en: b.ent?.value },
      support,
    });
    if (vus.size >= LIMITES[support]) break;
  }
  oeuvres.push(...vus.values());
  console.log(support, vus.size);
}

// Résolution des images (Commons, par lots de 50).
const parFichier = new Map(oeuvres.map((o) => [o.fichier, o]));
const fichiers = [...parFichier.keys()];
for (let i = 0; i < fichiers.length; i += 50) {
  const lot = fichiers.slice(i, i + 50);
  const url = `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=size&format=json&titles=${encodeURIComponent(lot.map((f) => `File:${f}`).join('|'))}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } }).then((x) => x.json());
  const norm = new Map((r.query.normalized || []).map((n) => [n.to, n.from]));
  for (const p of Object.values(r.query.pages)) {
    const info = p.imageinfo?.[0];
    if (!info) continue;
    const nom = (norm.get(p.title) || p.title).replace(/^File:/, '');
    const o = parFichier.get(nom) || parFichier.get(p.title.replace(/^File:/, ''));
    if (o) { o.w = info.width; o.h = info.height; }
  }
}

// Niveaux : rang dans la notoriété (ici le nombre de langues).
const avecImage = oeuvres.filter((o) => o.w && o.h).sort((a, b) => b.n - a.n);
const bornes = CONFIG.catalogue.percentiles;
avecImage.forEach((o, i) => {
  const r = (i + 0.5) / avecImage.length;
  o.niveau = r < bornes[5] * 8 ? 5 : r < bornes[4] * 4 ? 4 : r < bornes[3] * 2 ? 3 : r < bornes[2] ? 2 : r < bornes[1] ? 1 : 0;
});

// Musées : collections avec fréquentation renseignée.
const cols = [...new Set(avecImage.map((o) => o.collection?.q).filter((c) => /^Q\d+$/.test(c || "")))];
const visites = await sparql(`${PREFIXES}
SELECT ?m ?v ?l ?lfr ?ville WHERE {
  VALUES ?m { ${cols.map((c) => `wd:${c}`).join(' ')} }
  ?m wdt:P1174 ?v .
  OPTIONAL { ?m rdfs:label ?lfr FILTER(LANG(?lfr) = "fr") }
  OPTIONAL { ?m rdfs:label ?l FILTER(LANG(?l) = "en") }
  OPTIONAL { ?m wdt:P131 ?c . ?c rdfs:label ?ville FILTER(LANG(?ville) = "fr") }
}`);
const musees = new Map();
for (const b of visites) {
  const id = q(b.m.value);
  const v = Number(b.v.value);
  const m = musees.get(id);
  if (!m || v > m.visiteurs) musees.set(id, { q: id, nom: b.lfr?.value || b.l?.value || id, ville: b.ville?.value, visiteurs: v });
}

rmSync(SORTIE, { recursive: true, force: true });
mkdirSync(join(SORTIE, 'oeuvres'), { recursive: true });
mkdirSync(join(SORTIE, 'index'), { recursive: true });
mkdirSync(join(SORTIE, 'musees'), { recursive: true });
const ids = new Map([...musees.keys()].map((k, i) => [k, i + 1]));
const final = avecImage.map((o, i) => ({
  id: i + 1, q: o.q, cles: [o.q], titre: o.titre, ...(o.titreEn && o.titreEn !== o.titre ? { titreEn: o.titreEn } : {}),
  ...(o.artiste ? { artiste: o.artiste } : {}), ...(o.an !== undefined ? { date: String(o.an), an: o.an } : {}),
  support: o.support, ...(o.mouvement ? { mouvement: o.mouvement } : {}), ...(o.pays ? { pays: o.pays } : {}),
  ...(o.collection ? { collection: o.collection } : {}), ...(o.collection && ids.has(o.collection.q) ? { musee: ids.get(o.collection.q) } : {}),
  image: { src: 'commons', fichier: o.fichier, w: o.w, h: o.h },
  wiki: Object.fromEntries(Object.entries(o.wiki).filter(([, v]) => v)), vues: o.n * 10000, niveau: o.niveau,
}));
writeFileSync(join(SORTIE, 'oeuvres', '0000.json'), JSON.stringify(final));
for (const s of Object.keys(SUPPORTS)) {
  for (let n = 0; n <= 5; n++) {
    writeFileSync(join(SORTIE, 'index', `${s}-${n}.json`), JSON.stringify(final.filter((o) => o.support === s && o.niveau === n).map((o) => o.id)));
  }
}
const listeMusees = [...musees.values()].map((m) => {
  const id = ids.get(m.q);
  const conservees = final.filter((o) => o.musee === id);
  writeFileSync(join(SORTIE, 'musees', `${id}.json`), JSON.stringify(conservees.map((o) => [o.id, o.support, o.niveau, o.an ?? null, o.artiste?.q ?? null, o.mouvement?.q ?? null, o.pays?.q ?? null])));
  return { id, q: m.q, nom: m.nom, ville: m.ville, visiteurs: m.visiteurs, prestige: conservees.reduce((s, o) => s + CONFIG.niveaux[o.niveau].prestige, 0), oeuvres: conservees.length };
}).sort((a, b) => b.visiteurs - a.visiteurs);
writeFileSync(join(SORTIE, 'musees.json'), JSON.stringify(listeMusees));
writeFileSync(join(SORTIE, 'fusions.json'), '{}');
writeFileSync(join(SORTIE, 'meta.json'), JSON.stringify({ version: 'essai', tranche: 1000, total: final.length, provisoire: true }));
console.log(`${final.length} œuvres, ${listeMusees.length} musées`);
