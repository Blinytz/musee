// Assemblage du catalogue : de cache/wikidata.json, des sources d'API et des
// pages vues (etat/vues/) vers catalogue/, au format de docs/CATALOGUE.md.
//
//   node construire.mjs            assemble (sources d'API comprises)
//   node construire.mjs --wikidata refait d'abord l'extraction Wikidata
//
// Variables : RIJKS_PLAFOND (estampes et photographies du Rijksmuseum par type,
// 0 par défaut), MET_PLAFOND (appels d'image Met par passage), SANS_API=1.
//
// Les sorties sont déterministes (tri par id, clés dans un ordre fixe) : un
// mois sans changement réel ne produit aucun diff, ce qui garde le dépôt léger.

import { readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE, ETAT, SORTIE, SUPPORTS, lireJson, ecrireJson, journal, assurerDossier } from './commun.mjs';
import { CONFIG } from '../../js/config.js';
import { choisirImages } from './images.mjs';
import { sourceNga, sourceAic, sourceMet, sourceRijks, MUSEES_SOURCES } from './sources.mjs';

const TRANCHE = CONFIG.catalogue.tranche;
const PRESTIGE = CONFIG.niveaux.map((n) => n.prestige);
const UNITES_CM = { Q174728: 1, Q11573: 100, Q174789: 0.1, Q218593: 2.54, Q3710: 30.48 };
const ROMAINS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];

// Les tirets longs sont proscrits de tout texte visible dans l'écosystème :
// « La Grande Jatte — 1884 » devient « La Grande Jatte · 1884 », et un
// intervalle « 1853–1890 » prend un trait d'union simple.
export function propre(texte) {
  if (typeof texte !== 'string') return texte;
  return texte.replace(/\s+[—–]\s+/g, ' · ').replace(/[—–‒−]+/g, '-').trim();
}

const nomDe = (e) => (e ? propre(e.fr || e.en) : undefined);

function libelle(entites, q) {
  const n = nomDe(entites[q]);
  return n ? { q, nom: n } : undefined;
}

function texteAnnee(a) { return a < 0 ? `${-a} av. J.-C.` : String(a); }

/** Dates Wikidata « 1503-01-01T00:00:00Z|9 » → { date affichable, an }. */
export function lireDates(dates) {
  if (!dates?.length) return {};
  const vals = dates.map((d) => {
    const [t, p] = d.split('|');
    const m = /^([+-]?\d+)-/.exec(t);
    return m ? { an: Number(m[1]), prec: Number(p) } : null;
  }).filter(Boolean).sort((x, y) => x.an - y.an);
  if (!vals.length) return {};
  const premier = vals[0];
  const dernier = vals[vals.length - 1];
  if (premier.prec <= 7) {
    // Précision au siècle : Wikidata note indifféremment 1501, 1550 ou 1600
    // pour « XVIe siècle ». `an` prend le milieu du siècle, sans quoi 1600
    // classerait l'œuvre au XVIIe dans les thèmes par siècle.
    const s = Math.floor((Math.abs(premier.an) - 1) / 100) + 1;
    const nom = s < ROMAINS.length ? `${ROMAINS[s]}e siècle` : `${s}e siècle`;
    const milieu = (s - 1) * 100 + 50;
    return { date: premier.an < 0 ? `${nom} av. J.-C.` : nom, an: premier.an < 0 ? -milieu : milieu };
  }
  if (premier.prec === 8) return { date: `années ${premier.an - (premier.an % 10)}`, an: premier.an };
  const date = dernier.an !== premier.an ? `${texteAnnee(premier.an)}-${texteAnnee(dernier.an)}` : texteAnnee(premier.an);
  return { date, an: premier.an };
}

function enCm(valeurs) {
  if (!valeurs?.length) return undefined;
  const conv = valeurs.map((v) => { const [q, u] = v.split('|'); return { cm: Number(q) * (UNITES_CM[u] ?? NaN), cmNatif: u === 'Q174728' }; })
    .filter((x) => Number.isFinite(x.cm) && x.cm > 0);
  if (!conv.length) return undefined;
  const choix = conv.find((x) => x.cmNatif) || conv[0];
  return Math.round(choix.cm * 10) / 10;
}

/** Pages vues par entité : somme des mois suivis, ramenée à 12 mois. */
function chargerVues() {
  const dossier = join(ETAT, 'vues');
  const fichiers = existsSync(dossier) ? readdirSync(dossier).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort().slice(-12) : [];
  const somme = new Map();
  const mois = new Map();
  for (const f of fichiers) {
    const { entites } = lireJson(join(dossier, f));
    for (const [q, n] of Object.entries(entites)) {
      somme.set(q, (somme.get(q) || 0) + n);
      mois.set(q, (mois.get(q) || 0) + 1);
    }
  }
  const vues = new Map();
  for (const [q, s] of somme) vues.set(q, Math.round((s * 12) / mois.get(q)));
  return { vues, mois: fichiers.map((f) => f.slice(0, 7)) };
}

async function chargerSources(wd, artistesAvecPage) {
  if (process.env.SANS_API) return [];
  const qAvecPage = new Set(Object.keys(wd.oeuvres));
  const tout = [];
  // SOURCES=rijks,met,nga permet d'écarter une source dont les images ne
  // s'afficheraient pas (le IIIF de l'AIC est derrière un pare-feu anti-robots).
  const actives = (process.env.SOURCES || 'rijks,met,aic,nga').split(',');
  for (const [nom, fn] of [
    ['rijks', () => sourceRijks({ artistesAvecPage, plafondGraphiques: Number(process.env.RIJKS_PLAFOND || 0) })],
    ['met', () => sourceMet({ artistesAvecPage, qAvecPage, plafond: Number(process.env.MET_PLAFOND || Infinity) })],
    ['aic', () => sourceAic()],
    ['nga', () => sourceNga()],
  ]) {
    if (!actives.includes(nom)) continue;
    try { tout.push(...await fn()); } catch (e) {
      // Une source en panne ne doit pas priver le mois de tout le reste.
      journal(`source ${nom} indisponible : ${e.message}`);
    }
  }
  return tout;
}

export async function construire() {
  const t0 = Date.now();
  if (process.argv.includes('--wikidata')) await (await import('./wikidata.mjs')).extraireWikidata();
  const wd = lireJson(join(CACHE, 'wikidata.json'));
  if (!wd) throw new Error('cache/wikidata.json manquant : node wikidata.mjs');
  const { oeuvres: owd, artistes, entites, musees: mwd } = wd;

  const aPage = (e) => !!(e?.liens?.['fr.wikipedia'] || e?.liens?.['en.wikipedia']);
  const artistesAvecPage = new Set(Object.keys(artistes).filter((q) => aPage(artistes[q])));
  const parUlan = new Map();
  for (const [q, a] of Object.entries(artistes)) for (const u of a.ulan || []) if (!parUlan.has(u)) parUlan.set(u, q);
  const parArtic = new Map();
  for (const [q, a] of Object.entries(artistes)) for (const u of a.artic || []) if (!parArtic.has(u)) parArtic.set(u, q);

  // 1. Sources d'API et liens inverses vers les œuvres avec page.
  const api = await chargerSources(wd, artistesAvecPage);
  for (const x of api) {
    if (!x.artiste && x.articArtiste) x.artiste = parArtic.get(x.articArtiste);
    if (!x.artiste && x.ulanArtiste) x.artiste = parUlan.get(x.ulanArtiste);
    if (x.q && owd[x.q]) {
      const [src, id] = x.cle.split(':');
      const liste = (owd[x.q][src] ||= []);
      if (!liste.includes(id)) liste.push(id);
    }
  }

  // 2. Images des œuvres Wikidata.
  const images = await choisirImages(owd);

  // 3. Liste des œuvres retenues.
  const retenues = [];
  // Une clé n'appartient qu'à une œuvre : deux fiches Wikidata qui citent le
  // même objet de musée (doublon Wikidata) partageraient sinon leur id.
  const dejaVues = new Set();
  for (const q of Object.keys(owd).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))) {
    const o = owd[q];
    if (!images[q] || !o.support) continue;
    const cles = [q, ...['rijks', 'met', 'aic', 'nga'].flatMap((s) => (o[s] || []).map((id) => `${s}:${id}`))]
      .filter((c) => !dejaVues.has(c));
    for (const c of cles) dejaVues.add(c);
    retenues.push({ q, cles, page: true, o, image: images[q] });
  }
  const ordreSources = ['rijks', 'met', 'aic', 'nga'];
  api.sort((x, y) => ordreSources.indexOf(x.cle.split(':')[0]) - ordreSources.indexOf(y.cle.split(':')[0]) || x.cle.localeCompare(y.cle));
  let sansArtiste = 0;
  for (const x of api) {
    if (dejaVues.has(x.cle) || (x.q && (owd[x.q] || dejaVues.has(x.q)))) continue;
    if (!x.artiste || !artistesAvecPage.has(x.artiste)) { sansArtiste++; continue; }
    const cles = x.q ? [x.cle, x.q] : [x.cle];
    for (const c of cles) dejaVues.add(c);
    retenues.push({ q: x.q, cles, page: false, x, image: x.image });
  }
  // Exclusions décidées à la main (clés Q… ou source:id), si une œuvre ne doit
  // jamais apparaître dans le jeu. Liste vide par défaut.
  const exclues = new Set(lireJson(join(ETAT, 'exclusions.json'), []));
  if (exclues.size) {
    for (let i = retenues.length - 1; i >= 0; i--) if (retenues[i].cles.some((c) => exclues.has(c))) retenues.splice(i, 1);
  }
  journal(`œuvres retenues : ${retenues.length} (${retenues.filter((r) => r.page).length} avec page), ${sansArtiste} œuvres d'API écartées faute d'artiste avec page`);

  // 4. Notoriété et niveaux.
  const { vues, mois } = chargerVues();
  const provisoire = mois.length < 12;
  for (const r of retenues) {
    if (r.page) r.vues = vues.get(r.q) || 0;
    else {
      const a = vues.get(r.x.artiste) || 0;
      r.vues = Math.round(a * CONFIG.catalogue.partArtisteSansPage);
    }
  }
  const avecPage = retenues.filter((r) => r.page).sort((x, y) => y.vues - x.vues || x.q.localeCompare(y.q));
  const seuils = {};
  for (const [niveau, part] of Object.entries(CONFIG.catalogue.percentiles)) {
    const rang = Math.max(1, Math.ceil(part * avecPage.length));
    seuils[niveau] = avecPage[rang - 1]?.vues ?? 0;
  }
  // Le rang, pas la seule valeur, départage les ex aequo : sans quoi un mois
  // sans dump (tout à 0) mettrait toutes les œuvres au plus haut niveau.
  avecPage.forEach((r, i) => {
    const p = (i + 1) / avecPage.length;
    let n = 0;
    for (const [niv, part] of Object.entries(CONFIG.catalogue.percentiles).sort((a, b) => b[0] - a[0])) {
      if (p <= part) { n = Number(niv); break; }
    }
    r.niveau = r.vues > 0 ? Math.max(n, 0) : 0;
  });
  for (const r of retenues) if (!r.page) r.niveau = r.vues >= seuils[1] && seuils[1] > 0 ? 1 : 0;

  // 5. Identifiants stables.
  const ids = lireJson(join(ETAT, 'ids.json'), {});
  const fusions = lireJson(join(SORTIE, 'fusions.json'), {});
  let prochain = Object.values(ids).reduce((m, v) => Math.max(m, v), 0) + 1;
  const nouvelles = [];
  for (const r of retenues) {
    const connus = [...new Set(r.cles.map((c) => ids[c]).filter((x) => x !== undefined))].sort((a, b) => a - b);
    if (!connus.length) { nouvelles.push(r); continue; }
    r.id = connus[0];
    for (const autre of connus.slice(1)) fusions[autre] = r.id;
    for (const c of r.cles) ids[c] = r.id;
  }
  // Les nouvelles œuvres reçoivent leurs ids dans un ordre reproductible.
  nouvelles.sort((x, y) => x.cles[0].localeCompare(y.cles[0]));
  for (const r of nouvelles) { r.id = prochain++; for (const c of r.cles) ids[c] = r.id; }
  // Une fusion dont la cible a elle-même fusionné pointe directement au bout.
  for (const k of Object.keys(fusions)) { let v = fusions[k]; while (fusions[v] !== undefined) v = fusions[v]; fusions[k] = v; }

  // 6. Musées classés.
  const museesIds = lireJson(join(ETAT, 'musees-ids.json'), {});
  let prochainMusee = Object.values(museesIds).reduce((m, v) => Math.max(m, v), 0) + 1;
  for (const q of Object.keys(mwd).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))) {
    if (museesIds[q] === undefined) museesIds[q] = prochainMusee++;
  }
  const museeClasse = (q) => (q && mwd[q] ? q : null);

  // 7. Fiches.
  const fiches = [];
  for (const r of retenues) {
    const f = { id: r.id };
    if (r.page) {
      const o = r.o;
      f.q = r.q;
      f.cles = r.cles;
      const titre = propre(o.fr || o.en || r.q);
      f.titre = titre;
      if (o.en && propre(o.en) !== titre) f.titreEn = propre(o.en);
      const createur = (o.createurs || []).find((q) => artistes[q]);
      if (createur) f.artiste = libelle(artistes, createur);
      Object.assign(f, lireDates(o.dates));
      f.support = o.support;
      const mv = (o.mouvements || []).map((q) => libelle(entites, q)).find(Boolean);
      if (mv) f.mouvement = mv;
      const pays = (o.pays || []).map((q) => libelle(entites, q)).find(Boolean)
        || (createur ? (artistes[createur].pays || []).map((q) => libelle(entites, q)).find(Boolean) : undefined);
      if (pays) f.pays = pays;
      // Collection : celle d'un musée classé d'abord (directe ou par son parent).
      let musee = null; let collection = null;
      for (const c of o.collections || []) {
        const [coll, parent] = c.split('>');
        const m = museeClasse(coll) || museeClasse(parent);
        if (m && !musee) { musee = m; collection = m; }
        if (!collection) collection = coll;
      }
      const lc = collection ? (collection === musee ? libelle(mwd, musee) || libelle(entites, musee) : libelle(entites, collection)) : undefined;
      if (lc) f.collection = lc;
      if (musee) f.musee = museesIds[musee];
      const h = enCm(o.hauteur); const l = enCm(o.largeur);
      if (h && l) f.dim = [h, l];
      f.image = r.image;
      const wiki = {};
      if (o.liens?.['fr.wikipedia']) wiki.fr = o.liens['fr.wikipedia'];
      if (o.liens?.['en.wikipedia']) wiki.en = o.liens['en.wikipedia'];
      f.wiki = wiki;
    } else {
      const x = r.x;
      if (r.q) f.q = r.q;
      f.cles = r.cles;
      f.titre = propre(x.titre) || 'Sans titre';
      f.artiste = libelle(artistes, x.artiste);
      if (x.date) f.date = propre(x.date);
      if (x.an !== undefined) f.an = x.an;
      f.support = x.support;
      const pays = (artistes[x.artiste]?.pays || []).map((q) => libelle(entites, q)).find(Boolean);
      if (pays) f.pays = pays;
      const lc = libelle(mwd, x.musee) || libelle(entites, x.musee);
      if (lc) f.collection = lc;
      if (museeClasse(x.musee)) f.musee = museesIds[x.musee];
      if (x.dim) f.dim = x.dim;
      f.image = x.image;
      f.vuesArtiste = true;
    }
    f.vues = r.vues;
    f.niveau = r.niveau;
    fiches.push(f);
  }
  fiches.sort((a, b) => a.id - b.id);

  // 8. Écriture.
  assurerDossier(SORTIE);
  const tranches = new Map();
  for (const f of fiches) {
    const t = Math.floor(f.id / TRANCHE);
    if (!tranches.has(t)) tranches.set(t, []);
    tranches.get(t).push(f);
  }
  const dossierOeuvres = assurerDossier(join(SORTIE, 'oeuvres'));
  const ecrits = new Set();
  for (const [t, liste] of tranches) {
    const nom = `${String(t).padStart(4, '0')}.json`;
    ecrireJson(join(dossierOeuvres, nom), liste);
    ecrits.add(nom);
  }
  for (const f of readdirSync(dossierOeuvres)) if (!ecrits.has(f)) rmSync(join(dossierOeuvres, f));

  const dossierIndex = assurerDossier(join(SORTIE, 'index'));
  for (const f of readdirSync(dossierIndex)) rmSync(join(dossierIndex, f));
  const parSupportNiveau = {};
  for (const s of SUPPORTS) for (let n = 0; n < PRESTIGE.length; n++) {
    const liste = fiches.filter((f) => f.support === s && f.niveau === n).map((f) => f.id);
    parSupportNiveau[`${s}-${n}`] = liste.length;
    ecrireJson(join(dossierIndex, `${s}-${n}.json`), liste);
  }

  const prestigeMusee = new Map();
  const oeuvresMusee = new Map();
  for (const f of fiches) {
    if (f.musee === undefined) continue;
    prestigeMusee.set(f.musee, (prestigeMusee.get(f.musee) || 0) + PRESTIGE[f.niveau]);
    if (!oeuvresMusee.has(f.musee)) oeuvresMusee.set(f.musee, []);
    oeuvresMusee.get(f.musee).push([f.id, f.support, f.niveau, f.an ?? null, f.artiste?.q ?? null, f.mouvement?.q ?? null, f.pays?.q ?? null]);
  }
  // Le classement ne garde que les musées nommés et réellement fréquentés :
  // Wikidata compte aussi des fiches sans nom et des fréquentations d'un
  // visiteur par an, qui n'ont rien à faire dans un classement mondial.
  const visiteursMin = Number(process.env.CLASSEMENT_MIN ?? 10000);
  const listeMusees = Object.entries(mwd).filter(([, m]) => nomDe(m) && m.visiteurs >= visiteursMin).map(([q, m]) => {
    const id = museesIds[q];
    const r = { id, q, nom: nomDe(m) };
    const ville = nomDe(entites[m.lieu]); if (ville) r.ville = ville;
    const pays = nomDe(entites[m.pays]); if (pays) r.pays = pays;
    r.visiteurs = m.visiteurs;
    if (m.annee) r.annee = m.annee;
    r.prestige = prestigeMusee.get(id) || 0;
    r.oeuvres = oeuvresMusee.get(id)?.length || 0;
    return r;
  }).sort((a, b) => b.visiteurs - a.visiteurs || a.id - b.id);
  ecrireJson(join(SORTIE, 'musees.json'), listeMusees);
  const dossierMusees = assurerDossier(join(SORTIE, 'musees'));
  for (const f of readdirSync(dossierMusees)) rmSync(join(dossierMusees, f));
  const classes = new Set(listeMusees.map((m) => m.id));
  for (const [id, lignes] of oeuvresMusee) {
    if (classes.has(id)) ecrireJson(join(dossierMusees, `${id}.json`), lignes.sort((a, b) => a[0] - b[0]));
  }

  ecrireJson(join(SORTIE, 'fusions.json'), Object.fromEntries(Object.entries(fusions).sort((a, b) => a[0] - b[0])));
  ecrireJson(join(ETAT, 'ids.json'), Object.fromEntries(Object.entries(ids).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))), 0);
  ecrireJson(join(ETAT, 'musees-ids.json'), Object.fromEntries(Object.entries(museesIds).sort((a, b) => a[1] - b[1])), 0);

  // Artistes cités par les API mais absents de l'extraction (ni ULAN ni RKD) :
  // la prochaine extraction Wikidata les ajoutera, pour suivre leurs pages vues.
  const inconnus = [...new Set(api.map((x) => x.artiste).filter((q) => q && !artistes[q]))].sort();
  ecrireJson(join(ETAT, 'artistes-api.json'), inconnus);

  // Seuls les 12 derniers mois servent : les plus anciens quittent le dépôt.
  const dossierVues = join(ETAT, 'vues');
  if (existsSync(dossierVues)) {
    const tous = readdirSync(dossierVues).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).sort();
    for (const f of tous.slice(0, -12)) rmSync(join(dossierVues, f));
  }

  const compte = (pred) => fiches.filter(pred).length;
  const meta = {
    version: mois[mois.length - 1] || null,
    genere: new Date().toISOString(),
    tranche: TRANCHE,
    total: fiches.length,
    avecPage: compte((f) => !f.vuesArtiste),
    sansPage: compte((f) => f.vuesArtiste),
    parNiveau: Object.fromEntries(PRESTIGE.map((_, n) => [n, compte((f) => f.niveau === n)])),
    parSupport: Object.fromEntries(SUPPORTS.map((s) => [s, compte((f) => f.support === s)])),
    parSupportNiveau,
    parSource: fiches.reduce((acc, f) => { acc[f.image.src] = (acc[f.image.src] || 0) + 1; return acc; }, {}),
    seuils,
    musees: listeMusees.length,
    moisVues: mois,
    provisoire,
  };
  ecrireJson(join(SORTIE, 'meta.json'), meta, 2);
  journal(`catalogue : ${fiches.length} œuvres, ${listeMusees.length} musées, ${tranches.size} tranches, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  journal(JSON.stringify({ parNiveau: meta.parNiveau, parSupport: meta.parSupport, seuils, provisoire }));
  return meta;
}

if (process.argv[1]?.endsWith('construire.mjs')) await construire();
