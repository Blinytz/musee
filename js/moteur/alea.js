// Hasard reproductible. Le serveur et l'application rejouent les mêmes jours
// et doivent tirer exactement les mêmes arrivages, demandes de prêt et motifs
// de craquelures : tout tirage part d'une graine textuelle.

/** Empreinte 32 bits (FNV-1a) d'une chaîne. */
export function empreinte(texte) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Générateur mulberry32 : renvoie une fonction donnant un réel de [0, 1). */
export function generateur(graine) {
  let a = typeof graine === 'number' ? graine >>> 0 : empreinte(String(graine));
  return function suivant() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Choix pondéré : `options` est une liste de [valeur, poids]. */
export function choixPondere(options, alea) {
  const total = options.reduce((s, [, p]) => s + Math.max(0, p), 0);
  if (total <= 0) return undefined;
  let x = alea() * total;
  for (const [valeur, poids] of options) {
    x -= Math.max(0, poids);
    if (x < 0) return valeur;
  }
  return options[options.length - 1][0];
}

/** Entier de [0, n). */
export function entier(n, alea) {
  return Math.floor(alea() * n);
}

/**
 * UUID v4. `p_reference_id` du registre est typé uuid : un identifiant d'une
 * autre forme ferait échouer l'écriture. `crypto.randomUUID` n'existe qu'en
 * contexte sécurisé, d'où le repli sur `getRandomValues`, puis sur Math.random.
 */
export function uuid() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const o = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(o);
  else for (let i = 0; i < 16; i++) o[i] = Math.floor(Math.random() * 256);
  o[6] = (o[6] & 0x0f) | 0x40;
  o[8] = (o[8] & 0x3f) | 0x80;
  const h = [...o].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const FORME_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
