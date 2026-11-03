// Rendu de la restauration sur l'image réelle (spec, section 5).
//
// Cinq couches, paramètres continus dans chaque étape : mosaïque et
// désaturation, voile (vernis jauni, voile argenté, papier jauni), crasse et
// taches, craquelures, lacunes. Motifs tirés de la graine de l'œuvre.
//
// L'image source n'est JAMAIS lue pixel par pixel : beaucoup de serveurs de
// musées n'envoient pas d'en-têtes CORS, ce qui « souille » le canvas. On ne
// fait donc que dessiner (drawImage, filtres, compositions) ; seules nos
// propres textures passent par putImageData.

import { bruitFractal, champLacunes, craquelures } from './bruit.js';

/** Valeur interpolée d'une suite de points [progression, valeur]. */
export function interpoler(points, p, geometrique = false) {
  if (p <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [p1, v1] = points[i];
    const [p0, v0] = points[i - 1];
    if (p <= p1) {
      const t = p1 === p0 ? 1 : (p - p0) / (p1 - p0);
      return geometrique && v0 > 0 && v1 > 0 ? v0 * (v1 / v0) ** t : v0 + (v1 - v0) * t;
    }
  }
  return points[points.length - 1][1];
}

/** Paramètres de rendu pour une progression de 0 à 1. */
export function parametres(rendu, progression) {
  const p = Math.min(1, Math.max(0, progression));
  return {
    p,
    blocs: interpoler(rendu.blocs, p, true),
    saturation: interpoler(rendu.saturation, p),
    lacunes: interpoler(rendu.lacunes, p),
    craquelures: interpoler(rendu.craquelures, p),
    crasse: interpoler(rendu.crasse, p),
    voile: interpoler(rendu.voile, p),
    fondu: interpoler(rendu.fondu, p),
    flou: interpoler(rendu.flou, p),
  };
}

/** Étape en cours : { index, nom, part } où part est l'avancement dans l'étape. */
export function etape(rendu, progression) {
  const p = Math.min(1, Math.max(0, progression));
  let debut = 0;
  for (let i = 0; i < rendu.etapes.length; i++) {
    const e = rendu.etapes[i];
    if (p < e.fin || i === rendu.etapes.length - 1) {
      return { index: i, nom: e.nom, part: (p - debut) / (e.fin - debut) };
    }
    debut = e.fin;
  }
  return { index: 0, nom: rendu.etapes[0].nom, part: 0 };
}

/* ---------- Textures, gardées en cache par œuvre ---------- */

const cache = new Map();
function memo(cle, fabrique) {
  if (!cache.has(cle)) {
    if (cache.size > 60) cache.delete(cache.keys().next().value);
    cache.set(cle, fabrique());
  }
  return cache.get(cle);
}

function horsEcran(l, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(l, h);
  const c = document.createElement('canvas');
  c.width = l;
  c.height = h;
  return c;
}

function couleur(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Crasse et taches : alpha variable, couleur du support. */
function textureCrasse(graine, look, l, h) {
  return memo(`crasse:${graine}:${look.crasse}:${look.taches}:${l}x${h}`, () => {
    const c = horsEcran(l, h);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(l, h);
    const [r, g, b] = couleur(look.crasse);
    const nuage = bruitFractal(`${graine}:crasse`, { frequence: 5, octaves: 5 });
    const taches = bruitFractal(`${graine}:taches`, { frequence: 22, octaves: 2 });
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < l; x++) {
        const u = x / l;
        const v = y / h;
        let a = 0.35 + 0.65 * nuage(u, v);
        if (look.taches) {
          const t = taches(u, v);
          // Rousseurs : petites taches franches là où le bruit culmine.
          if (t > 0.68) a = Math.min(1, a + look.taches * (t - 0.68) * 6);
        }
        const k = 4 * (y * l + x);
        img.data[k] = r;
        img.data[k + 1] = g;
        img.data[k + 2] = b;
        img.data[k + 3] = Math.round(255 * a);
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  });
}

/** Craquelures visibles pour une intensité donnée. */
function textureCraquelures(graine, look, l, h, intensite) {
  const champ = memo(`craq:${graine}:${look.cellules}:${l}x${h}`, () => craquelures(graine, l, h, { cellules: look.cellules }));
  const c = memo(`craqc:${graine}:${l}x${h}`, () => horsEcran(l, h));
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(l, h);
  const [r, g, b] = couleur(look.craquelures);
  const epaisseur = 0.045;
  for (let k = 0; k < champ.distances.length; k++) {
    if (champ.aretes[k] >= intensite) continue;
    const d = champ.distances[k];
    if (d >= epaisseur) continue;
    const a = 1 - d / epaisseur;
    img.data[4 * k] = r;
    img.data[4 * k + 1] = g;
    img.data[4 * k + 2] = b;
    img.data[4 * k + 3] = Math.round(255 * a * a);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Lacunes : tesselles manquantes de la mosaïque, remplies de la couleur du
 * fond (enduit, papier, mur). Le champ est échantillonné au centre de chaque
 * tesselle : quand la mosaïque s'affine, les lacunes s'affinent avec elle et
 * gardent le même dessin d'ensemble. L'ordre de comblement suit la valeur du
 * champ, tirée de la graine.
 */
function textureLacunes(graine, look, bw, bh, part) {
  const R = 320;
  const RH = Math.max(1, Math.round(R * bh / bw));
  const champ = memo(`lac:${graine}:${look.bords}:${look.grainLacunes}:${look.dispersion}:${R}x${RH}`, () => champLacunes(graine, R, RH, {
    bords: look.bords, frequence: look.grainLacunes || 12, dispersion: look.dispersion ?? 0.5,
  }));
  const c = horsEcran(bw, bh);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(bw, bh);
  const [r, g, b] = couleur(look.fond);
  const seuil = champ.seuil(part);
  for (let y = 0; y < bh; y++) {
    const cy = Math.min(RH - 1, Math.floor((y + 0.5) / bh * RH));
    for (let x = 0; x < bw; x++) {
      const cx = Math.min(R - 1, Math.floor((x + 0.5) / bw * R));
      const v = champ.valeurs[cy * R + cx];
      if (v >= seuil) continue;
      // Légère variation par tesselle : l'enduit n'est jamais parfaitement uni.
      const n = 0.88 + 0.24 * champ.valeurs[((cy * 7 + 3) % RH) * R + ((cx * 13 + 5) % R)];
      const k = 4 * (y * bw + x);
      img.data[k] = Math.min(255, r * n);
      img.data[k + 1] = Math.min(255, g * n);
      img.data[k + 2] = Math.min(255, b * n);
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ---------- Dessin ---------- */

/**
 * Dessine l'œuvre dans `canvas` (dimensions déjà fixées) à la progression
 * donnée. `image` : HTMLImageElement chargé (ou null : fond neutre).
 */
export function dessiner(canvas, image, { progression, support, graine, rendu }) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');
  const prm = parametres(rendu, progression);
  const look = rendu.supports[support] || rendu.supports.peinture;
  const restante = 1 - prm.p;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.fillStyle = look.fond;
  ctx.fillRect(0, 0, W, H);

  if (image) {
    const filtre = [
      `saturate(${prm.saturation.toFixed(3)})`,
      look.sepia ? `sepia(${(look.sepia * prm.voile).toFixed(3)})` : '',
      `contrast(${(1 - 0.25 * prm.crasse).toFixed(3)})`,
    ].join(' ');

    if (prm.fondu < 1) {
      const bw = Math.max(1, Math.round(prm.blocs));
      const bh = Math.max(1, Math.round(bw * H / W));
      const petit = horsEcran(bw, bh);
      const pctx = petit.getContext('2d');
      pctx.imageSmoothingEnabled = true;
      pctx.imageSmoothingQuality = 'high';
      pctx.drawImage(image, 0, 0, bw, bh);
      ctx.imageSmoothingEnabled = false;
      ctx.filter = filtre;
      ctx.drawImage(petit, 0, 0, W, H);
    }
    if (prm.fondu > 0) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = prm.fondu;
      const flou = prm.flou * W / 700;
      ctx.filter = `${filtre}${flou > 0.05 ? ` blur(${flou.toFixed(2)}px)` : ''}`;
      ctx.drawImage(image, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.filter = 'none';
  }

  // Voile : vernis jauni, voile argenté (plus fort sur les bords), papier jauni.
  if (prm.voile > 0 && look.voile) {
    ctx.globalCompositeOperation = look.voileMode || 'multiply';
    ctx.globalAlpha = prm.voile * look.voileForce;
    if (look.voileBords) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.15, W / 2, H / 2, Math.hypot(W, H) / 2);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, look.voile);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = look.voile;
    }
    ctx.fillRect(0, 0, W, H);
  }

  const lt = Math.min(240, Math.max(60, Math.round(W / 4)));
  const ht = Math.max(1, Math.round(lt * H / W));

  if (prm.crasse > 0) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = prm.crasse * look.crasseForce;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(textureCrasse(graine, look, lt, ht), 0, 0, W, H);
  }

  if (prm.craquelures > 0) {
    const lc = Math.min(520, Math.max(120, Math.round(W / 1.6)));
    const hc = Math.max(1, Math.round(lc * H / W));
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = look.craqueluresForce * Math.min(1, 0.4 + restante);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(textureCraquelures(graine, look, lc, hc, prm.craquelures), 0, 0, W, H);
  }

  if (prm.lacunes > 0) {
    const bw = Math.max(1, Math.round(prm.blocs));
    const bh = Math.max(1, Math.round(bw * H / W));
    const masque = textureLacunes(graine, look, bw, bh, prm.lacunes);
    // Le fond d'une lacune n'est pas un blanc uniforme : on y laisse
    // transparaître une version très floue et pâlie de l'œuvre, sous l'enduit.
    // La silhouette générale reste ainsi lisible à travers les pertes.
    const couche = horsEcran(W, H);
    const cc = couche.getContext('2d');
    if (image) {
      const tw = 6;
      const th = Math.max(1, Math.round(tw * H / W));
      const flou = horsEcran(tw, th);
      const fc = flou.getContext('2d');
      fc.imageSmoothingQuality = 'high';
      fc.drawImage(image, 0, 0, tw, th);
      cc.imageSmoothingEnabled = true;
      cc.filter = `saturate(0.25) brightness(${look.eclaircissement ?? 1.25})`;
      cc.drawImage(flou, 0, 0, W, H);
      cc.filter = 'none';
    }
    cc.globalAlpha = image ? (look.enduit ?? 0.55) : 1;
    cc.imageSmoothingEnabled = false;
    cc.drawImage(masque, 0, 0, W, H);
    cc.globalAlpha = 1;
    cc.globalCompositeOperation = 'destination-in';
    cc.drawImage(masque, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(couche, 0, 0);
  }
  ctx.restore();
}

/* ---------- Images ---------- */

const images = new Map();

/** Charge une image sans demander CORS : elle reste dessinable. */
export function chargerImage(url) {
  if (!url) return Promise.resolve(null);
  if (!images.has(url)) {
    if (images.size > 80) images.delete(images.keys().next().value);
    images.set(url, new Promise((ok, ko) => {
      const img = new Image();
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => ok(img);
      img.onerror = () => { images.delete(url); ko(new Error('Image indisponible')); };
      img.src = url;
    }));
  }
  return images.get(url);
}
