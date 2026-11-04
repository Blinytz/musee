// Rendu de la restauration sur l'image réelle (spec, section 5).
//
// Une toile qui a vécu, couche par couche : encrassement qui brouille la
// lecture, vernis oxydé (ambre, désaturation, voile brun), crasse et taches,
// craquelures fines, lacunes qui laissent voir l'enduit, grain de surface.
// Chaque couche s'efface à son étape ; motifs tirés de la graine de l'œuvre.
//
// L'image source n'est JAMAIS lue pixel par pixel : beaucoup de serveurs de
// musées n'envoient pas d'en-têtes CORS, ce qui « souille » le canvas. On ne
// fait donc que dessiner (drawImage, compositions, mélanges) ; seules nos
// propres textures passent par putImageData.

import { bruitFractal, champLacunes, craquelures, champNettoyage } from './bruit.js';
import { generateur } from '../moteur/alea.js';

/** Valeur interpolée d'une suite de points [progression, valeur]. */
export function interpoler(points, p) {
  if (p <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [p1, v1] = points[i];
    const [p0, v0] = points[i - 1];
    if (p <= p1) {
      const t = p1 === p0 ? 1 : (p - p0) / (p1 - p0);
      return v0 + (v1 - v0) * t;
    }
  }
  return points[points.length - 1][1];
}

/** Intensité de chaque couche (de 0 à 1) pour une progression de 0 à 1. */
export function parametres(rendu, progression) {
  const p = Math.min(1, Math.max(0, progression));
  return {
    p,
    flou: interpoler(rendu.flou, p),
    vernis: interpoler(rendu.vernis, p),
    crasse: interpoler(rendu.crasse, p),
    lacunes: interpoler(rendu.lacunes, p),
    bordLacunes: interpoler(rendu.bordLacunes, p),
    craquelures: interpoler(rendu.craquelures, p),
    grain: interpoler(rendu.grain, p),
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
    if (cache.size > 80) cache.delete(cache.keys().next().value);
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

/** Toile de travail réutilisée, effacée à chaque emprunt. */
function tampon(nom, l, h) {
  const c = memo(`tampon:${nom}:${l}x${h}`, () => horsEcran(l, h));
  c.getContext('2d').clearRect(0, 0, l, h);
  return c;
}

function couleur(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Crasse et taches : une couleur, une opacité qui varie par plages. */
function textureCrasse(graine, look, l, h) {
  return memo(`crasse:${graine}:${look.crasse}:${look.taches}:${look.tachesFrequence}:${l}x${h}`, () => {
    const c = horsEcran(l, h);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(l, h);
    const [r, g, b] = couleur(look.crasse);
    const nuage = bruitFractal(`${graine}:crasse`, { frequence: 4, octaves: 5 });
    const taches = bruitFractal(`${graine}:taches`, { frequence: look.tachesFrequence || 10, octaves: 2 });
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < l; x++) {
        const u = x / l;
        const v = y / h;
        let a = Math.min(1, Math.max(0, (nuage(u, v) - 0.28) / 0.44));
        if (look.taches) {
          const t = taches(u, v);
          // Taches franches là où le bruit culmine : rousseurs, auréoles.
          if (t > 0.62) a = Math.min(1, a + look.taches * (t - 0.62) * 7);
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

/** Fissures visibles : la proportion `part` du réseau, en traits d'un pixel. */
function textureCraquelures(graine, look, l, h, part) {
  const champ = memo(`craq:${graine}:${look.cellules}:${look.deformation}:${l}x${h}`,
    () => craquelures(graine, l, h, { cellules: look.cellules, deformation: look.deformation }));
  return memo(`craqc:${graine}:${look.craquelures}:${l}x${h}:${part.toFixed(3)}`, () => {
    const c = horsEcran(l, h);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(l, h);
    const [r, g, b] = couleur(look.craquelures);
    const seuil = champ.seuil(part);
    // Épaisseur voulue en pixels, convertie en fraction de cellule.
    const epaisseur = (look.epaisseur || 1) / (l / champ.cellules);
    for (let k = 0; k < champ.distances.length; k++) {
      if (champ.valeurs[k] >= seuil) continue;
      const d = champ.distances[k];
      if (d >= epaisseur) continue;
      const a = 1 - d / epaisseur;
      img.data[4 * k] = r;
      img.data[4 * k + 1] = g;
      img.data[4 * k + 2] = b;
      img.data[4 * k + 3] = Math.round(255 * a);
    }
    ctx.putImageData(img, 0, 0);
    return c;
  });
}

/**
 * Lacunes : la couche picturale manque, on voit l'enduit (ou le papier, la
 * pierre). Un liseré sombre les borde tant que les écailles ne sont pas
 * refixées : il s'efface pendant la consolidation (`bord`).
 */
function textureLacunes(graine, look, l, h, part, bord) {
  const champ = memo(`lac:${graine}:${look.bords}:${look.grainLacunes}:${look.regroupement}:${l}x${h}`, () => champLacunes(graine, l, h, {
    bords: look.bords, frequence: look.grainLacunes || 12, dispersion: 0, regroupement: look.regroupement || 0,
  }));
  return memo(`lacc:${graine}:${look.fond}:${l}x${h}:${part.toFixed(3)}:${bord.toFixed(2)}`, () => {
    const c = horsEcran(l, h);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(l, h);
    const [r, g, b] = couleur(look.fond);
    const [rb, gb, bb] = couleur(look.bordLacune || '#2a190b');
    const seuil = champ.seuil(part);
    const anneau = champ.seuil(Math.min(0.999, part * (1 + (look.anneau ?? 0.5))));
    const alea = generateur(`${graine}:enduit`);
    for (let k = 0; k < champ.valeurs.length; k++) {
      const v = champ.valeurs[k];
      const i = 4 * k;
      if (v < seuil) {
        // L'enduit n'est jamais parfaitement uni.
        const n = 0.95 + 0.05 * alea();
        img.data[i] = r * n;
        img.data[i + 1] = g * n;
        img.data[i + 2] = b * n;
        img.data[i + 3] = 255;
      } else if (bord > 0 && v < anneau) {
        img.data[i] = rb;
        img.data[i + 1] = gb;
        img.data[i + 2] = bb;
        img.data[i + 3] = Math.round(200 * bord * (1 - (v - seuil) / (anneau - seuil)));
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  });
}

/** Grain de surface : un carreau de bruit gris, répété. */
function textureGrain() {
  return memo('grain', () => {
    const l = 128;
    const c = horsEcran(l, l);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(l, l);
    const alea = generateur('grain');
    for (let k = 0; k < l * l; k++) {
      const v = Math.round(255 * alea());
      img.data[4 * k] = v;
      img.data[4 * k + 1] = v;
      img.data[4 * k + 2] = v;
      img.data[4 * k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  });
}

/* ---------- Dessin ---------- */

/**
 * Image floutée par réduction puis agrandissement lissé : `ctx.filter` manque
 * encore à une partie des Safari. Deux paliers évitent le quadrillage.
 */
function dessinerFlou(ctx, image, W, H, rayon) {
  const f = Math.max(1, rayon * 1.6);
  const bw = Math.max(2, Math.round(W / f));
  const bh = Math.max(2, Math.round(H / f));
  const petit = tampon('flou', bw, bh);
  const pc = petit.getContext('2d');
  pc.imageSmoothingEnabled = true;
  pc.imageSmoothingQuality = 'high';
  pc.drawImage(image, 0, 0, bw, bh);
  let source = petit;
  if (f > 4) {
    const mw = Math.min(W, bw * 3);
    const mh = Math.min(H, bh * 3);
    const moyen = tampon('flou2', mw, mh);
    const mc = moyen.getContext('2d');
    mc.imageSmoothingEnabled = true;
    mc.imageSmoothingQuality = 'high';
    mc.drawImage(petit, 0, 0, mw, mh);
    source = moyen;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, W, H);
}

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
  const echelle = Math.max(W, H) / 700;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = look.fond;
  ctx.fillRect(0, 0, W, H);

  if (image) {
    const rayon = prm.flou * (look.flou || 6) * echelle;
    if (rayon > 0.4) {
      dessinerFlou(ctx, image, W, H, rayon);
      const nette = 1 - Math.min(1, prm.flou * 1.2);
      if (nette > 0.01) {
        ctx.globalAlpha = nette;
        ctx.drawImage(image, 0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    } else {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, W, H);
    }
  }

  // Vernis oxydé : désaturation, teinte ambrée ; puis le voile (crasse brune,
  // poussière, voile argenté), qui part avec le vernis ou avec la crasse.
  const v = prm.vernis;
  if (v > 0) {
    if (look.desature) {
      ctx.globalCompositeOperation = 'saturation';
      ctx.globalAlpha = look.desature * v;
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, W, H);
    }
    if (look.teinte) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = look.teinteForce * v;
      ctx.fillStyle = look.teinte;
      ctx.fillRect(0, 0, W, H);
    }
  }
  const voile = look.voileEtape === 'crasse' ? prm.crasse : v;
  if (voile > 0 && look.voile) {
    ctx.globalCompositeOperation = look.voileMode || 'source-over';
    ctx.globalAlpha = look.voileForce * voile;
    if (look.voileBords) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.hypot(W, H) / 2);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, look.voile);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = look.voile;
    }
    ctx.fillRect(0, 0, W, H);
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;

  if (prm.crasse > 0) {
    const l = Math.min(320, Math.max(64, Math.round(W / 3)));
    const h = Math.max(1, Math.round(l * H / W));
    ctx.globalAlpha = prm.crasse * look.crasseForce;
    ctx.drawImage(textureCrasse(graine, look, l, h), 0, 0, W, H);
  }

  if (prm.craquelures > 0) {
    const l = Math.min(900, Math.max(120, W));
    const h = Math.max(1, Math.round(l * H / W));
    ctx.globalAlpha = look.craqueluresForce;
    ctx.drawImage(textureCraquelures(graine, look, l, h, prm.craquelures), 0, 0, W, H);
  }

  if (prm.lacunes > 0) {
    const l = Math.min(520, Math.max(80, W));
    const h = Math.max(1, Math.round(l * H / W));
    ctx.globalAlpha = 1;
    ctx.drawImage(textureLacunes(graine, look, l, h, prm.lacunes, prm.bordLacunes), 0, 0, W, H);
  }

  if (prm.grain > 0 && look.grain) {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = look.grain * prm.grain;
    ctx.fillStyle = ctx.createPattern(textureGrain(), 'repeat');
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/**
 * Fenêtre de nettoyage : `apres` gagne `avant` sur une proportion `part` de
 * la toile, par un bord doux et irrégulier, comme un restaurateur qui
 * avance au coton. `avant` et `apres` sont deux toiles déjà dessinées.
 */
export function nettoyer(canvas, avant, apres, part, graine) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(avant, 0, 0, W, H);
  if (part >= 0.999) ctx.drawImage(apres, 0, 0, W, H);
  else if (part > 0.001) {
    const l = 180;
    const h = Math.max(1, Math.round(l * H / W));
    const champ = memo(`net:${graine}:${l}x${h}`, () => champNettoyage(graine, l, h));
    const seuil = champ.seuil(part);
    const masque = tampon('masque', l, h);
    const mc = masque.getContext('2d');
    const img = mc.createImageData(l, h);
    const doux = 0.012;
    for (let k = 0; k < champ.valeurs.length; k++) {
      const a = Math.min(1, Math.max(0, (seuil - champ.valeurs[k]) / doux + 0.5));
      img.data[4 * k + 3] = Math.round(255 * a);
    }
    mc.putImageData(img, 0, 0);
    const couche = tampon('nettoyage', W, H);
    const cc = couche.getContext('2d');
    cc.globalCompositeOperation = 'source-over';
    cc.drawImage(apres, 0, 0, W, H);
    cc.globalCompositeOperation = 'destination-in';
    cc.imageSmoothingEnabled = true;
    cc.drawImage(masque, 0, 0, W, H);
    cc.globalCompositeOperation = 'source-over';
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
