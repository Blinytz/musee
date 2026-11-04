// Textures procédurales reproductibles : bruit de valeur fractal, lacunes,
// craquelures (bruit cellulaire F2 - F1) et fenêtre de nettoyage. Tout part de la graine de l'œuvre,
// pour que le motif soit identique d'une ouverture à l'autre.

import { generateur, empreinte } from '../moteur/alea.js';

/** Bruit de valeur lissé, plusieurs octaves, dans [0, 1]. */
export function bruitFractal(graine, { octaves = 4, frequence = 6 } = {}) {
  const tailles = [];
  for (let o = 0; o < octaves; o++) {
    const n = Math.round(frequence * 2 ** o) + 1;
    const alea = generateur(`${graine}:o${o}`);
    const grille = new Float32Array((n + 1) * (n + 1));
    for (let i = 0; i < grille.length; i++) grille[i] = alea();
    tailles.push({ n, grille, poids: 0.5 ** o });
  }
  const totalPoids = tailles.reduce((s, t) => s + t.poids, 0);
  const lisse = (t) => t * t * (3 - 2 * t);
  return function valeur(x, y) {
    let v = 0;
    for (const { n, grille, poids } of tailles) {
      const fx = x * (n - 1);
      const fy = y * (n - 1);
      const ix = Math.min(n - 1, Math.max(0, Math.floor(fx)));
      const iy = Math.min(n - 1, Math.max(0, Math.floor(fy)));
      const tx = lisse(fx - ix);
      const ty = lisse(fy - iy);
      const a = grille[iy * (n + 1) + ix];
      const b = grille[iy * (n + 1) + ix + 1];
      const c = grille[(iy + 1) * (n + 1) + ix];
      const d = grille[(iy + 1) * (n + 1) + ix + 1];
      v += poids * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
    }
    return v / totalPoids;
  };
}

/**
 * Champ des lacunes : une valeur par cellule, l'ordre de comblement. Une
 * cellule est manquante tant que sa valeur reste sous le seuil qui laisse la
 * proportion voulue de lacunes. `bords` attire les lacunes vers les bords
 * (déchirures d'estampe, fragments de sculpture).
 */
export function champLacunes(graine, largeur, hauteur, { bords = 0, frequence = 7, dispersion = 0, regroupement = 0 } = {}) {
  const f = bruitFractal(`${graine}:lacunes`, { frequence, octaves: 3 });
  // `regroupement` rassemble les pertes en foyers, comme sur une vraie toile
  // où les dégâts suivent l'humidité, les chocs, les pliures.
  const foyers = bruitFractal(`${graine}:foyers`, { frequence: 3, octaves: 2 });
  // `dispersion` mêle un bruit blanc au bruit lissé : des pertes isolées
  // parmi les plages, au lieu de continents d'un seul tenant.
  const alea = generateur(`${graine}:dispersion`);
  const valeurs = new Float32Array(largeur * hauteur);
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const u = (x + 0.5) / largeur;
      const v = (y + 0.5) / hauteur;
      const bord = Math.min(u, v, 1 - u, 1 - v) * 2;
      const lisse = (f(u, v) * (1 - regroupement) + foyers(u, v) * regroupement) * (1 - dispersion) + alea() * dispersion;
      valeurs[y * largeur + x] = lisse * (1 - bords) + bord * bords;
    }
  }
  const tries = Float32Array.from(valeurs).sort();
  return {
    largeur, hauteur, valeurs,
    seuil(part) {
      if (part <= 0) return -Infinity;
      if (part >= 1) return Infinity;
      return tries[Math.floor(part * (tries.length - 1))];
    },
  };
}

/**
 * Réseau de craquelures : bruit cellulaire sur grille jittée, déformé pour que
 * les fissures serpentent au lieu de dessiner des polygones. Pour chaque
 * pixel : distance à la fissure la plus proche (en cellules) et rang
 * d'apparition, mêlant une valeur propre à la fissure et une valeur régionale :
 * les fissures disparaissent une à une, par plages.
 */
export function craquelures(graine, largeur, hauteur, { cellules = 24, deformation = 0.3 } = {}) {
  const cw = cellules;
  const ch = Math.max(1, Math.round(cellules * hauteur / largeur));
  const alea = generateur(`${graine}:craquelures`);
  const points = new Float32Array(cw * ch * 2);
  for (let i = 0; i < cw * ch; i++) {
    points[2 * i] = alea();
    points[2 * i + 1] = alea();
  }
  const sel = empreinte(`${graine}:aretes`);
  const dx = bruitFractal(`${graine}:dx`, { frequence: 5, octaves: 3 });
  const dy = bruitFractal(`${graine}:dy`, { frequence: 5, octaves: 3 });
  const region = bruitFractal(`${graine}:region`, { frequence: 3, octaves: 3 });
  const distances = new Float32Array(largeur * hauteur);
  const valeurs = new Float32Array(largeur * hauteur);
  const ampleur = 2 * deformation;
  for (let y = 0; y < hauteur; y++) {
    const v = (y + 0.5) / hauteur;
    for (let x = 0; x < largeur; x++) {
      const u = (x + 0.5) / largeur;
      const gx = u * cw + (dx(u, v) - 0.5) * ampleur * 2;
      const gy = v * ch + (dy(u, v) - 0.5) * ampleur * 2;
      const cx = Math.floor(gx);
      const cy = Math.floor(gy);
      let d1 = Infinity; let d2 = Infinity; let i1 = -1; let i2 = -1;
      for (let oy = -1; oy <= 1; oy++) {
        const ny = cy + oy;
        if (ny < 0 || ny >= ch) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const nx = cx + ox;
          if (nx < 0 || nx >= cw) continue;
          const i = ny * cw + nx;
          const d = (nx + points[2 * i] - gx) ** 2 + (ny + points[2 * i + 1] - gy) ** 2;
          if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = i; } else if (d < d2) { d2 = d; i2 = i; }
        }
      }
      const k = y * largeur + x;
      distances[k] = i2 < 0 ? 1 : Math.sqrt(d2) - Math.sqrt(d1);
      valeurs[k] = 0.55 * region(u, v) + 0.45 * (melange(Math.min(i1, i2), Math.max(i1, i2), sel) / 4294967296);
    }
  }
  return { largeur, hauteur, distances, valeurs, cellules: cw, seuil: seuils(valeurs) };
}

/**
 * Champ de la fenêtre de nettoyage : la zone propre part d'un point tiré de
 * la graine et gagne la toile par un bord irrégulier. `seuil(part)` donne la
 * valeur sous laquelle une proportion `part` de la surface est nettoyée.
 */
export function champNettoyage(graine, largeur, hauteur) {
  const alea = generateur(`${graine}:nettoyage`);
  const cx = (0.3 + 0.4 * alea()) * largeur;
  const cy = (0.3 + 0.4 * alea()) * hauteur;
  const bord = bruitFractal(`${graine}:bord`, { frequence: 4, octaves: 4 });
  const echelle = Math.max(largeur, hauteur);
  const valeurs = new Float32Array(largeur * hauteur);
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const d = Math.hypot(x - cx, y - cy) / echelle;
      valeurs[y * largeur + x] = d + (bord((x + 0.5) / largeur, (y + 0.5) / hauteur) - 0.5) * 0.45;
    }
  }
  return { largeur, hauteur, valeurs, seuil: seuils(valeurs) };
}

/** Quantiles d'un champ : seuil(part) laisse `part` des valeurs en dessous. */
function seuils(valeurs) {
  const tries = Float32Array.from(valeurs).sort();
  return (part) => {
    if (part <= 0) return -Infinity;
    if (part >= 1) return Infinity;
    return tries[Math.floor(part * (tries.length - 1))];
  };
}

// Empreinte entière d'une paire : appelée pour chaque pixel, elle doit rester
// sans chaîne de caractères.
function melange(a, b, sel) {
  let h = Math.imul(a ^ sel, 0x9e3779b1) ^ Math.imul(b + 0x7f4a7c15, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}
