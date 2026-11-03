// Étape 4 : œuvres des API ouvertes (NGA, AIC, Met, Rijksmuseum).
//
// Deux usages :
//  - une œuvre d'API reliée à une œuvre Wikidata AVEC page apporte son image
//    haute définition à cette œuvre (lien inverse, quand Wikidata ignore l'id) ;
//  - une œuvre d'API SANS page entre au catalogue si son artiste a une page fr
//    ou en ; sa notoriété vaudra 1 % de celle de l'artiste.
//
// Chaque source rend des œuvres normalisées :
//   { cle, q?, titre, artiste (QID), date?, an?, support, dim?, image, musee (QID) }
// Les réponses lentes à obtenir (Met, Rijksmuseum) sont gardées dans cache/.

import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { CACHE, UA, lireJson, ecrireJson, journal, chercher, chercherJson, parallele } from './commun.mjs';
import { telechargerCsv, lireCsv } from './csv.mjs';
import { indexImagesNga, imageMetBrute, MetBloque } from './images.mjs';

export const MUSEES_SOURCES = { nga: 'Q214867', aic: 'Q239303', met: 'Q160236', rijks: 'Q190804' };

const QID = /Q\d+/;
const qDeUrl = (u) => (u && QID.exec(u)?.[0]) || null;

/** « 62,2 × 34,8 cm » ou « 24 x 30 in. (61 x 76.2 cm) » → [h, l] en cm. */
export function dimensionsTexte(texte) {
  if (!texte) return undefined;
  const m = /(\d+(?:[.,]\d+)?)\s*[×x]\s*(\d+(?:[.,]\d+)?)(?:\s*[×x]\s*\d+(?:[.,]\d+)?)?\s*cm/i.exec(texte);
  if (!m) return undefined;
  const h = Number(m[1].replace(',', '.')); const l = Number(m[2].replace(',', '.'));
  return h > 0 && l > 0 ? [h, l] : undefined;
}

function annee(x) {
  const n = Number(String(x ?? '').trim());
  return Number.isFinite(n) && String(x ?? '').trim() !== '' && n !== 0 ? n : undefined;
}

// --- National Gallery of Art : tout est dans les CSV du dépôt opendata.
export async function sourceNga() {
  const base = 'https://raw.githubusercontent.com/NationalGalleryOfArt/opendata/main/data';
  const [objets, liens, constituants] = await Promise.all([
    telechargerCsv(`${base}/objects.csv`, 'nga-objects.csv'),
    telechargerCsv(`${base}/objects_constituents.csv`, 'nga-objects_constituents.csv'),
    telechargerCsv(`${base}/constituents.csv`, 'nga-constituents.csv'),
  ]);
  const qConstituant = new Map();
  for await (const c of lireCsv(constituants)) if (c.wikidataid) qConstituant.set(c.constituentid, c.wikidataid);
  const artisteObjet = new Map();
  for await (const l of lireCsv(liens)) {
    // Le premier artiste dans l'ordre d'affichage fait foi ; les « d'après »,
    // éditeurs, imprimeurs et ateliers ne sont pas l'auteur de l'œuvre.
    if (l.roletype !== 'artist') continue;
    if (/after|publisher|printer|copy|workshop|circle|follower|school|attributed|possibly|manner|imitator|style|lender|dedicat/i.test(l.role || '')) continue;
    const q = qConstituant.get(l.constituentid);
    if (!q) continue;
    const ordre = Number(l.displayorder) || 0;
    const deja = artisteObjet.get(l.objectid);
    if (!deja || ordre < deja.ordre) artisteObjet.set(l.objectid, { q, ordre });
  }
  for (const [k, v] of artisteObjet) artisteObjet.set(k, v.q);
  const images = await indexImagesNga();
  const SUPPORT = { Painting: 'peinture', Sculpture: 'sculpture', Print: 'estampe', Photograph: 'photographie' };
  const r = [];
  for await (const o of lireCsv(objets)) {
    const support = SUPPORT[o.classification];
    if (!support) continue;
    const image = images.get(o.objectid);
    if (!image) continue;
    const { sequence, ...img } = image;
    r.push({
      cle: `nga:${o.objectid}`,
      q: qDeUrl(o.wikidataid) || undefined,
      titre: o.title,
      artiste: artisteObjet.get(o.objectid),
      date: o.displaydate || undefined,
      an: annee(o.beginyear),
      support,
      dim: dimensionsTexte(o.dimensions),
      image: img,
      musee: MUSEES_SOURCES.nga,
    });
  }
  journal(`NGA : ${r.length} œuvres avec image`);
  return r;
}

/**
 * Lit une archive tar en flux (sortie de `bzip2 -dc`) et appelle `surFichier`
 * pour chaque fichier dont le nom passe `filtre`. Évite d'écrire sur disque les
 * 200 000 petits JSON de l'archive de l'AIC.
 */
function lireTar(commande, filtre, surFichier) {
  return new Promise((resolve, reject) => {
    const proc = spawn('bash', ['-o', 'pipefail', '-c', commande], { stdio: ['ignore', 'pipe', 'inherit'] });
    let tampon = Buffer.alloc(0);
    let attendu = null; // { nom, taille, garder }
    proc.stdout.on('data', (morceau) => {
      tampon = tampon.length ? Buffer.concat([tampon, morceau]) : morceau;
      for (;;) {
        if (!attendu) {
          if (tampon.length < 512) break;
          const entete = tampon.subarray(0, 512);
          if (entete.every((o) => o === 0)) { tampon = tampon.subarray(512); continue; }
          const nom = entete.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
          const prefixe = entete.subarray(345, 500).toString('utf8').replace(/\0.*$/s, '');
          const taille = parseInt(entete.subarray(124, 136).toString('ascii').replace(/\0.*$/s, '').trim() || '0', 8);
          const type = String.fromCharCode(entete[156]);
          const complet = prefixe ? `${prefixe}/${nom}` : nom;
          attendu = { nom: complet, taille, garder: (type === '0' || type === '\0') && filtre(complet) };
          tampon = tampon.subarray(512);
        }
        const bloc = Math.ceil(attendu.taille / 512) * 512;
        if (tampon.length < bloc) break;
        if (attendu.garder) surFichier(attendu.nom, tampon.subarray(0, attendu.taille));
        tampon = tampon.subarray(bloc);
        attendu = null;
      }
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`archive : code ${code}`))));
  });
}

// --- Art Institute of Chicago : l'archive publique (130 Mo, mise à jour par
// l'AIC) plutôt que 1 300 pages d'API à 60 requêtes par minute, comme l'AIC
// le demande pour les usages en masse. Les artistes se raccordent à Wikidata
// par l'identifiant d'artiste ARTIC (P6295) ou, à défaut, par l'ULAN.
export async function sourceAic() {
  const chemin = join(CACHE, 'sources', 'aic.json');
  const cache = lireJson(chemin, null);
  if (cache && Date.now() - Date.parse(cache.genere) < 20 * 86400000) return cache.oeuvres;
  const SUPPORT = { Painting: 'peinture', Sculpture: 'sculpture', Print: 'estampe', Photograph: 'photographie' };
  const retenues = [];
  const ulan = new Map();
  const url = 'https://artic-api-data.s3.amazonaws.com/artic-api-data.tar.bz2';
  journal('AIC : lecture de l\'archive');
  await lireTar(
    `curl -sSf --retry 5 -A "${UA}" "${url}" | bzip2 -dc`,
    (nom) => /\/json\/(artworks|agents)\/\d+\.json$/.test(nom),
    (nom, contenu) => {
      let j;
      try { j = JSON.parse(contenu.toString('utf8')); } catch { return; }
      if (nom.includes('/agents/')) { if (j.ulan_id) ulan.set(j.id, String(j.ulan_id)); return; }
      if (SUPPORT[j.artwork_type_title] && j.image_id && j.thumbnail?.width && j.artist_id) retenues.push(j);
    },
  );
  const oeuvres = retenues.map((a) => {
    const d = (a.dimensions_detail || []).find((x) => x.height && x.width);
    return {
      cle: `aic:${a.id}`,
      titre: a.title,
      articArtiste: String(a.artist_id),
      ulanArtiste: ulan.get(a.artist_id),
      date: a.date_display || undefined,
      an: annee(a.date_start),
      support: SUPPORT[a.artwork_type_title],
      dim: d ? [d.height, d.width] : undefined,
      image: { src: 'aic', iiif: `https://www.artic.edu/iiif/2/${a.image_id}`, w: a.thumbnail.width, h: a.thumbnail.height, max: a.is_public_domain ? 1686 : 843 },
      musee: MUSEES_SOURCES.aic,
    };
  });
  ecrireJson(chemin, { genere: new Date().toISOString(), oeuvres });
  journal(`AIC : ${oeuvres.length} œuvres avec image et artiste`);
  return oeuvres;
}

// --- Met : le CSV openaccess donne tout sauf l'image, qui exige un appel par
// objet ; on ne les fait que pour les œuvres retenues, et on les garde.
export async function sourceMet({ artistesAvecPage, qAvecPage, plafond = Infinity }) {
  const csv = await telechargerCsv('https://media.githubusercontent.com/media/metmuseum/openaccess/master/MetObjects.csv', 'met-objects.csv');
  const SUPPORT = { Paintings: 'peinture', Sculpture: 'sculpture', Prints: 'estampe', Photographs: 'photographie' };
  const candidates = [];
  for await (const o of lireCsv(csv)) {
    const support = SUPPORT[o.Classification];
    if (!support || o['Is Public Domain'] !== 'True') continue;
    const q = qDeUrl(o['Object Wikidata URL']);
    const artiste = qDeUrl((o['Artist Wikidata URL'] || '').split('|')[0]);
    // Retenue si elle complète une œuvre avec page (image) ou si son artiste a une page.
    if (!(q && qAvecPage.has(q)) && !(artiste && artistesAvecPage.has(artiste))) continue;
    candidates.push({
      cle: `met:${o['Object ID']}`,
      q: q || undefined,
      // Les titres asiatiques du Met sont « original|anglais » : on garde l'anglais.
      titre: (o.Title || '').split('|').pop().trim(),
      artiste: artiste || undefined,
      date: o['Object Date'] || undefined,
      an: annee(o['Object Begin Date']),
      support,
      dim: dimensionsTexte(o.Dimensions),
      musee: MUSEES_SOURCES.met,
    });
  }
  journal(`Met : ${candidates.length} candidates (domaine public, artiste avec page ou œuvre avec page)`);
  const chemin = join(CACHE, 'images', 'met.json');
  const images = lireJson(chemin, {});
  const aFaire = candidates.filter((c) => !(c.cle.slice(4) in images)).slice(0, plafond);
  let n = 0;
  let bloque = false;
  await parallele(aFaire, 2, async (c) => {
    if (bloque) return;
    const id = c.cle.slice(4);
    try {
      images[id] = await imageMetBrute(id);
    } catch (e) {
      if (e instanceof MetBloque) bloque = true; else journal(e.message);
    }
    if (++n % 2000 === 0) { journal(`Met : ${n}/${aFaire.length} images`); ecrireJson(chemin, images); }
  });
  ecrireJson(chemin, images);
  if (bloque) journal(`Met : refusé par le pare-feu après ${n} appels ; ${aFaire.length - n} œuvres reprises au prochain passage`);
  const r = candidates.filter((c) => images[c.cle.slice(4)]).map((c) => ({ ...c, image: images[c.cle.slice(4)] }));
  journal(`Met : ${r.length} œuvres avec image`);
  return r;
}

// --- Rijksmuseum : Search API (pages de 100 identifiants) puis profil Dublin
// Core de chaque objet et info.json IIIF. Trois requêtes par œuvre : on borne
// les estampes et photographies (390 000 et 122 000 avec image) par
// `plafondGraphiques`, les peintures et sculptures (~6 600) passent toutes.
export async function sourceRijks({ artistesAvecPage, plafondGraphiques = 0 }) {
  const chemin = join(CACHE, 'sources', 'rijks.json');
  const memo = lireJson(chemin, { objets: {}, agents: {} });
  const TYPES = { painting: 'peinture', sculpture: 'sculpture', print: 'estampe', photograph: 'photographie' };
  const ids = [];
  for (const [type, support] of Object.entries(TYPES)) {
    const plafond = support === 'estampe' || support === 'photographie' ? plafondGraphiques : Infinity;
    let url = `https://data.rijksmuseum.nl/search/collection?type=${type}&imageAvailable=true`;
    let n = 0;
    while (url && n < plafond) {
      const j = await chercherJson(url);
      for (const it of j.orderedItems || []) { if (n++ >= plafond) break; ids.push([it.id.split('/').pop(), support]); }
      url = j.next?.id;
    }
    journal(`Rijksmuseum : ${n} ${type}`);
  }
  let k = 0;
  await parallele(ids, 4, async ([id, support]) => {
    if (!(id in memo.objets)) {
      try {
        const dc = await chercherJson(`https://id.rijksmuseum.nl/${id}?_profile=dc&_mediatype=application/ld%2Bjson`);
        const rel = [dc.relation].flat().filter(Boolean).map((x) => x['@id'] || x).find((x) => typeof x === 'string' && x.includes('micr.io'));
        const titre = [dc.title].flat().filter(Boolean).map((t) => (typeof t === 'string' ? { '@value': t } : t));
        const createur = [dc.creator].flat().filter(Boolean)[0];
        let image = null;
        if (rel) {
          const base = rel.replace(/\/full\/.*$/, '');
          const info = await chercherJson(`${base}/info.json`);
          if (info.width) image = { src: 'rijks', iiif: base, w: info.width, h: info.height };
        }
        memo.objets[id] = image && {
          titre: (titre.find((t) => t['@language'] === 'en') || titre.find((t) => t['@language'] === 'nl') || titre[0])?.['@value'],
          agent: createur?.['@id']?.split('/').pop(),
          date: typeof dc.date === 'string' ? dc.date : undefined,
          dim: dimensionsTexte(JSON.stringify(dc.extent || '')),
          image,
        };
      } catch (e) { memo.objets[id] = null; journal(`rijks ${id} : ${e.message}`); }
      if (++k % 1000 === 0) { journal(`Rijksmuseum : ${k} objets lus`); ecrireJson(chemin, memo); }
    }
  });
  // Agents → Wikidata : le Linked Art de l'agent porte ses équivalences.
  const agents = [...new Set(ids.map(([id]) => memo.objets[id]?.agent).filter(Boolean))].filter((a) => !(a in memo.agents));
  await parallele(agents, 4, async (a) => {
    try {
      const r = await chercher(`https://id.rijksmuseum.nl/${a}`, { headers: { Accept: 'application/ld+json' } });
      memo.agents[a] = r.ok ? qDeUrl(((await r.text()).match(/https?:\/\/www\.wikidata\.org\/entity\/Q\d+/) || [])[0]) : null;
    } catch { memo.agents[a] = null; }
  });
  ecrireJson(chemin, memo);
  const r = [];
  for (const [id, support] of ids) {
    const o = memo.objets[id];
    if (!o) continue;
    const artiste = memo.agents[o.agent] || undefined;
    r.push({ cle: `rijks:${id}`, titre: o.titre, artiste, date: o.date, an: annee(String(o.date || '').slice(0, 4)), support, dim: o.dim, image: o.image, musee: MUSEES_SOURCES.rijks });
  }
  journal(`Rijksmuseum : ${r.length} œuvres avec image`);
  return r;
}
