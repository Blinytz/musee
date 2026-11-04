// Petits outils DOM, sans framework.

import { icone } from './icones.js';

/** h('div.classe', { attributs, onclick }, enfants…) */
export function h(selecteur, props, ...enfants) {
  if (props === null || typeof props !== 'object' || props instanceof Node || Array.isArray(props)) {
    enfants.unshift(props);
    props = {};
  }
  // 'div#identifiant.classe.autre' : Chrome accepte désormais presque tout
  // nom de balise, un « div#x » mal découpé créerait un élément inconnu.
  const [tete, ...classes] = selecteur.split('.');
  const [tag, id] = tete.split('#');
  const el = document.createElement(tag || 'div');
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'classe') el.className = [el.className, v].filter(Boolean).join(' ');
    else if (k === 'style' && typeof v === 'object') {
      // Les propriétés personnalisées (--x) ne passent que par setProperty.
      for (const [p, x] of Object.entries(v)) {
        if (p.startsWith('--')) el.style.setProperty(p, x);
        else el.style[p] = x;
      }
    }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  ajouter(el, enfants);
  return el;
}

/** Ajoute des enfants en ignorant null, undefined et false (append les écrirait). */
export function ajouter(el, ...enfants) {
  for (const e of enfants.flat(Infinity)) {
    if (e === null || e === undefined || e === false) continue;
    el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
}

export function vider(el, ...enfants) {
  el.replaceChildren();
  ajouter(el, enfants);
  return el;
}

export { icone };

/* ---------- Formats ---------- */

const nf = new Intl.NumberFormat('fr-FR');
export const nombre = (n) => nf.format(Math.round(n || 0));

export function grand(n) {
  const v = Math.round(n || 0);
  if (v >= 1e6) return `${(v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: v >= 1e7 ? 1 : 2 })} M`;
  if (v >= 1e4) return `${(v / 1e3).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k`;
  return nf.format(v);
}

export function pourcent(x, decimales = 0) {
  return `${(Math.floor(x * 100 * 10 ** decimales) / 10 ** decimales).toLocaleString('fr-FR')} %`;
}

/** 95 → « 1 h 35 », 40 → « 40 min ». */
export function duree(minutes) {
  const m = Math.max(0, Math.round(minutes));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  if (!hh) return `${mm} min`;
  return mm ? `${hh} h ${String(mm).padStart(2, '0')}` : `${hh} h`;
}

/** Compte à rebours h:mm:ss. */
export function chrono(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function dateJour(jour, options = { day: 'numeric', month: 'long' }) {
  return new Date(jour * 864e5 + 12 * 3600e3).toLocaleDateString('fr-FR', { timeZone: 'UTC', ...options });
}

export function siecleTexte(s) {
  if (s === null || s === undefined) return '?';
  const romain = (n) => {
    const t = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let r = '';
    for (const [v, l] of t) while (n >= v) { r += l; n -= v; }
    return r;
  };
  return s > 0 ? `${romain(s)}e siècle` : `${romain(-s)}e siècle av. J.-C.`;
}

/** Majuscule initiale : Wikidata écrit souvent « baroque », « postimpressionnisme ». */
export function majuscule(texte) {
  if (!texte) return texte;
  return texte.charAt(0).toLocaleUpperCase('fr-FR') + texte.slice(1);
}

export function pluriel(n, un, plusieurs) {
  return `${nombre(n)} ${Math.abs(n) > 1 ? plusieurs : un}`;
}
