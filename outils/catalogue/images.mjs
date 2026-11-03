// Étape 3 : image par défaut des œuvres Wikidata, et sa résolution.
//
// Priorité de la spec : Rijksmuseum, Metropolitan Museum, Art Institute of
// Chicago, National Gallery of Art (haute définition, API ouvertes), puis
// Wikimedia Commons, puis l'image principale de la page Wikipédia en anglais.
// La résolution de chaque image est enregistrée : le zoom du mode inspection
// ne doit jamais dépasser le pixel réel.
//
// Les réponses des musées sont gardées dans `cache/images/` (un fichier par
// source) : un mois suivant ne redemande que les œuvres nouvelles.

import { join } from 'node:path';
import { CACHE, UA, lireJson, ecrireJson, journal, chercher, chercherJson, lots, parallele, cadence } from './commun.mjs';
import { telechargerCsv, lireCsv } from './csv.mjs';

const DOSSIER = join(CACHE, 'images');

/** Largeur et hauteur d'un JPEG d'après ses premiers octets (marqueur SOF). */
export function dimensionsJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    const longueur = buf.readUInt16BE(i + 2);
    // SOF0 à SOF15, sauf DHT (C4), JPG (C8) et DAC (CC).
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + longueur;
  }
  return null;
}

/** Résolution d'une image distante sans la télécharger entière. */
export async function dimensionsDistantes(url) {
  for (const octets of [131071, 1048575]) {
    try {
      const r = await chercher(url, { headers: { Range: `bytes=0-${octets}` } }, 3);
      if (!r.ok && r.status !== 206) return null;
      const d = dimensionsJpeg(Buffer.from(await r.arrayBuffer()));
      if (d) return d;
    } catch { return null; }
  }
  return null;
}

function memoire(nom) {
  const chemin = join(DOSSIER, `${nom}.json`);
  const donnees = lireJson(chemin, {});
  return { donnees, sauver: () => ecrireJson(chemin, donnees) };
}

// --- Rijksmuseum : profil Dublin Core (3 Ko au lieu de 170 Ko en Linked Art),
// dont `relation` porte l'adresse IIIF micr.io ; la taille vient de info.json.
export async function imageRijks(id, cache) {
  if (id in cache.donnees) return cache.donnees[id];
  let res = null;
  try {
    const dc = await chercherJson(`https://id.rijksmuseum.nl/${id}?_profile=dc&_mediatype=application/ld%2Bjson`);
    const rel = [dc.relation].flat().filter(Boolean).map((x) => x['@id'] || x).find((x) => typeof x === 'string' && x.includes('micr.io'));
    if (rel) {
      const base = rel.replace(/\/full\/.*$/, '');
      const info = await chercherJson(`${base}/info.json`);
      if (info.width && info.height) res = { src: 'rijks', iiif: base, w: info.width, h: info.height };
    }
  } catch (e) { journal(`rijks ${id} : ${e.message}`); }
  cache.donnees[id] = res;
  return res;
}

// --- Met : seules les œuvres du domaine public ont une image ; l'API ne donne
// pas la résolution, lue dans l'en-tête du JPEG original.
//
// Le pare-feu du Met (Imperva) bloque l'adresse entière dès qu'on enchaîne
// trop vite, bien en deçà des 80 requêtes par seconde annoncées : on se tient
// à 2 par seconde, et un refus (403) n'est JAMAIS mis en cache comme « pas
// d'image » ; il suspend l'étape, qui reprendra au passage suivant.
const rythmeMet = cadence(2);
export class MetBloque extends Error {}
let metBloque = false;

export async function imageMetBrute(id) {
  if (metBloque) throw new MetBloque('Met bloqué');
  await rythmeMet();
  const r = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`, {
    headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000),
  });
  if (r.status === 403 || r.status === 429) { metBloque = true; throw new MetBloque(`Met : HTTP ${r.status}`); }
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Met ${id} : HTTP ${r.status}`);
  const o = await r.json();
  if (!o.isPublicDomain || !o.primaryImage) return null;
  await rythmeMet();
  const d = await dimensionsDistantes(o.primaryImage);
  if (!d) throw new Error(`Met ${id} : taille illisible`);
  return { src: 'met', url: o.primaryImage, petite: o.primaryImageSmall || undefined, w: d.w, h: d.h };
}

export async function imageMet(id, cache) {
  if (id in cache.donnees) return cache.donnees[id];
  try {
    cache.donnees[id] = await imageMetBrute(id);
  } catch (e) { if (!(e instanceof MetBloque)) journal(e.message); }
  return cache.donnees[id] ?? null;
}

// --- AIC : par lots de 100. `thumbnail` donne la taille de l'original. Le
// serveur IIIF n'accepte pas n'importe quelle taille : 843 px est la largeur
// garantie, 1 686 px pour le domaine public. On le note dans `max`.
export async function imagesAic(ids, cache) {
  const manquants = ids.filter((id) => !(id in cache.donnees));
  for (const lot of lots(manquants, 100)) {
    try {
      const j = await chercherJson(`https://api.artic.edu/api/v1/artworks?ids=${lot.join(',')}&limit=100&fields=id,image_id,is_public_domain,thumbnail`);
      const vus = new Set();
      for (const a of j.data || []) {
        vus.add(String(a.id));
        cache.donnees[a.id] = a.image_id && a.thumbnail?.width
          ? { src: 'aic', iiif: `https://www.artic.edu/iiif/2/${a.image_id}`, w: a.thumbnail.width, h: a.thumbnail.height, max: a.is_public_domain ? 1686 : 843 }
          : null;
      }
      for (const id of lot) if (!vus.has(String(id))) cache.donnees[id] = null;
    } catch (e) { journal(`aic lot : ${e.message}`); }
    await new Promise((r) => setTimeout(r, 1100));
  }
  return Object.fromEntries(ids.map((id) => [id, cache.donnees[id] ?? null]));
}

// --- NGA : tout est dans le CSV `published_images` (vue primaire, accès libre).
let indexNga = null;
export async function indexImagesNga() {
  if (indexNga) return indexNga;
  const chemin = await telechargerCsv('https://raw.githubusercontent.com/NationalGalleryOfArt/opendata/main/data/published_images.csv', 'nga-published_images.csv');
  indexNga = new Map();
  for await (const l of lireCsv(chemin)) {
    if (l.viewtype !== 'primary' || l.openaccess !== '1') continue;
    const w = Number(l.width); const h = Number(l.height);
    if (!w || !h) continue;
    const deja = indexNga.get(l.depictstmsobjectid);
    if (!deja || Number(l.sequence) < deja.sequence) {
      indexNga.set(l.depictstmsobjectid, { src: 'nga', iiif: l.iiifurl, w, h, sequence: Number(l.sequence) });
    }
  }
  return indexNga;
}

function sansSequence(x) { if (!x) return null; const { sequence, ...r } = x; return r; }

// --- Commons : résolution par lots de 50 fichiers.
export async function imagesCommons(fichiers, cache, domaine = 'commons.wikimedia.org') {
  const manquants = [...new Set(fichiers)].filter((f) => !(f in cache.donnees));
  for (const lot of lots(manquants, 50)) {
    try {
      const url = `https://${domaine}/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=size|mime&titles=${encodeURIComponent(lot.map((f) => `File:${f}`).join('|'))}`;
      const j = await chercherJson(url);
      const norm = new Map((j.query?.normalized || []).map((n) => [n.to, n.from]));
      for (const p of j.query?.pages || []) {
        const nom = (norm.get(p.title) || p.title).replace(/^File:/, '');
        const ii = p.imageinfo?.[0];
        // Les formats que le canvas ne sait pas dessiner (TIFF, DjVu, PDF) sont
        // servis en vignette JPEG par Special:FilePath ; seule compte la taille.
        cache.donnees[nom] = ii && ii.width ? { w: ii.width, h: ii.height, mime: ii.mime } : null;
      }
      for (const f of lot) if (!(f in cache.donnees)) cache.donnees[f] = null;
    } catch (e) { journal(`commons lot : ${e.message}`); }
  }
}

// --- Page anglaise : image principale, licences non libres comprises (les
// œuvres protégées n'ont souvent que cela).
export async function imagesPagesEn(titres, cache) {
  const manquants = [...new Set(titres)].filter((t) => !(t in cache.donnees));
  for (const lot of lots(manquants, 50)) {
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=pageimages&piprop=name|original&pilicense=any&redirects=1&titles=${encodeURIComponent(lot.join('|'))}`;
      const j = await chercherJson(url);
      const retour = new Map();
      for (const n of j.query?.normalized || []) retour.set(n.to, n.from);
      for (const n of j.query?.redirects || []) retour.set(n.to, retour.get(n.from) || n.from);
      for (const p of j.query?.pages || []) {
        const titre = retour.get(p.title) || p.title;
        cache.donnees[titre] = p.pageimage && p.original?.width
          ? { fichier: p.pageimage.replace(/_/g, ' '), w: p.original.width, h: p.original.height, local: !p.original.source.includes('/commons/') }
          : null;
      }
      for (const t of lot) if (!(t in cache.donnees)) cache.donnees[t] = null;
    } catch (e) { journal(`pageimages lot : ${e.message}`); }
  }
}

/**
 * Choisit l'image de chaque œuvre Wikidata. Retourne { Q: image } où image
 * suit le contrat (src, iiif|url|fichier, w, h, éventuellement max et secours).
 */
export async function choisirImages(oeuvres) {
  const qs = Object.keys(oeuvres);
  const cRijks = memoire('rijks');
  const cMet = memoire('met');
  const cAic = memoire('aic');
  const cCommons = memoire('commons');
  const cEn = memoire('pages-en');

  const rijks = qs.filter((q) => oeuvres[q].rijks?.length);
  journal(`images : ${rijks.length} Rijksmuseum`);
  await parallele(rijks, 4, (q) => imageRijks(oeuvres[q].rijks[0], cRijks));
  cRijks.sauver();

  const met = qs.filter((q) => oeuvres[q].met?.length);
  journal(`images : ${met.length} Met`);
  await parallele(met, 6, (q) => imageMet(oeuvres[q].met[0], cMet));
  cMet.sauver();

  const aic = qs.filter((q) => oeuvres[q].aic?.length);
  journal(`images : ${aic.length} AIC`);
  await imagesAic(aic.map((q) => oeuvres[q].aic[0]), cAic);
  cAic.sauver();

  const nga = await indexImagesNga();

  const p18 = qs.flatMap((q) => oeuvres[q].images || []);
  journal(`images : ${p18.length} Commons`);
  await imagesCommons(p18, cCommons);
  cCommons.sauver();

  const sansImage = qs.filter((q) => !(oeuvres[q].images?.length) && oeuvres[q].liens?.['en.wikipedia']);
  journal(`images : ${sansImage.length} pages anglaises sans P18`);
  await imagesPagesEn(sansImage.map((q) => oeuvres[q].liens['en.wikipedia']), cEn);
  cEn.sauver();

  const choix = {};
  for (const q of qs) {
    const o = oeuvres[q];
    const candidats = [];
    for (const id of o.rijks || []) candidats.push(cRijks.donnees[id]);
    for (const id of o.met || []) candidats.push(cMet.donnees[id]);
    for (const id of o.aic || []) candidats.push(cAic.donnees[id]);
    for (const id of o.nga || []) candidats.push(sansSequence(nga.get(String(id))));
    for (const f of o.images || []) {
      const i = cCommons.donnees[f];
      if (i) candidats.push({ src: 'commons', fichier: f, w: i.w, h: i.h });
    }
    const en = o.liens?.['en.wikipedia'];
    if (en && cEn.donnees[en]) {
      const i = cEn.donnees[en];
      candidats.push({ src: i.local ? 'enwiki' : 'commons', fichier: i.fichier, w: i.w, h: i.h });
    }
    const valides = candidats.filter(Boolean);
    if (!valides.length) continue;
    const [premiere, ...autres] = valides;
    // Une image de musée peut être refusée par son serveur (AIC passe par un
    // pare-feu anti-robots) : une image Wikimedia de repli évite l'œuvre vide.
    const repli = premiere.src !== 'commons' && premiere.src !== 'enwiki'
      ? autres.find((x) => x.src === 'commons' || x.src === 'enwiki') : null;
    choix[q] = repli ? { ...premiere, secours: repli } : premiere;
  }
  return choix;
}
