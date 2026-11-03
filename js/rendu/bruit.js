// Textures procédurales reproductibles : bruit de valeur fractal et
// craquelures (bruit cellulaire F2 - F1). Tout part de la graine de l'œuvre,
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
export function champLacunes(graine, largeur, hauteur, { bords = 0, frequence = 7, dispersion = 0 } = {}) {
  const f = bruitFractal(`${graine}:lacunes`, { frequence, octaves: 3 });
  // `dispersion` mêle un bruit blanc au bruit lissé : des pertes isolées
  // parmi les plages, au lieu de continents d'un seul tenant.
  const alea = generateur(`${graine}:dispersion`);
  const valeurs = new Float32Array(largeur * hauteur);
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const u = (x + 0.5) / largeur;
      const v = (y + 0.5) / hauteur;
      const bord = Math.min(u, v, 1 - u, 1 - v) * 2;
      const lisse = f(u, v) * (1 - dispersion) + alea() * dispersion;
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
 * Réseau de craquelures : bruit cellulaire sur grille jittée. Chaque arête
 * (paire de cellules voisines) a sa propre valeur : on n'affiche que celles
 * sous `intensite`, si bien que les craquelures disparaissent une à une.
 */
export function craquelures(graine, largeur, hauteur, { cellules = 16 } = {}) {
  const cw = cellules;
  const ch = Math.max(1, Math.round(cellules * hauteur / largeur));
  const alea = generateur(`${graine}:craquelures`);
  const points = new Float32Array(cw * ch * 2);
  for (let i = 0; i < cw * ch; i++) {
    points[2 * i] = alea();
    points[2 * i + 1] = alea();
  }
  const sel = empreinte(`${graine}:aretes`);
  // Pour chaque pixel : distance à l'arête la plus proche et identité de l'arête.
  const distances = new Float32Array(largeur * hauteur);
  const aretes = new Float32Array(largeur * hauteur);
  for (let y = 0; y < hauteur; y++) {
    const gy = (y + 0.5) / hauteur * ch;
    const cy = Math.floor(gy);
    for (let x = 0; x < largeur; x++) {
      const gx = (x + 0.5) / largeur * cw;
      const cx = Math.floor(gx);
      let d1 = Infinity; let d2 = Infinity; let i1 = -1; let i2 = -1;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= ch) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          if (nx < 0 || nx >= cw) continue;
          const i = ny * cw + nx;
          const px = nx + points[2 * i];
          const py = ny + points[2 * i + 1];
          const d = (px - gx) ** 2 + (py - gy) ** 2;
          if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = i; } else if (d < d2) { d2 = d; i2 = i; }
        }
      }
      const k = y * largeur + x;
      distances[k] = Math.sqrt(d2) - Math.sqrt(d1);
      aretes[k] = melange(Math.min(i1, i2), Math.max(i1, i2), sel) / 4294967296;
    }
  }
  return { largeur, hauteur, distances, aretes, cellules: cw };
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
