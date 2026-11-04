// Composants partagés : annonces, feuilles, confirmations, vignettes d'œuvre.

import { h, icone, pourcent, siecleTexte, ajouter, majuscule } from './dom.js';
import { effets, siecle } from '../moteur/regles.js';
import { dessiner, chargerImage } from '../rendu/restauration.js';
import { urlImage, urlSecours, ratio } from '../rendu/images.js';
import { empreinte } from '../moteur/alea.js';

/* ---------- Annonces ---------- */

export function annoncer(message, { erreur = false, duree = 3200 } = {}) {
  const zone = document.getElementById('annonces');
  if (!zone) return;
  const a = h('div.annonce', { classe: erreur ? 'erreur' : '', role: erreur ? 'alert' : 'status' }, message);
  ajouter(zone, a);
  setTimeout(() => a.remove(), duree);
}

/** Message lisible d'une erreur du jeu ou du registre. */
export function messageErreur(e) {
  if (!e) return 'Erreur';
  if (e.code === 'solde') return 'Éclats insuffisants';
  if (e.code === 'conflit') return 'Le musée a changé entre-temps, réessayez';
  if (e.status === 401) return 'Session expirée, reconnectez-vous';
  if (e instanceof TypeError) return 'Réseau indisponible';
  return e.message || 'Erreur';
}

/* ---------- Feuilles ---------- */

export function feuille({ titre, contenu, actions = null, onFermer = null }) {
  const corps = h('div.feuille', { role: 'dialog', 'aria-modal': 'true' },
    h('div.feuille-poignee'),
    h('div.feuille-tete', h('h2', titre),
      h('button.bouton.icone-seule', { type: 'button', 'aria-label': 'Fermer', onclick: () => fermer() }, icone('fermer'))),
    contenu,
    actions);
  const voile = h('div.voile-fond', { onclick: (e) => { if (e.target === voile) fermer(); } }, corps);
  ajouter(document.body, voile);
  const echap = (e) => { if (e.key === 'Escape') fermer(); };
  document.addEventListener('keydown', echap);
  function fermer() {
    if (!voile.isConnected) return;
    voile.remove();
    document.removeEventListener('keydown', echap);
    onFermer?.();
  }
  return { fermer, corps };
}

export function confirmer(titre, { texte = null, oui = 'Confirmer', danger = false } = {}) {
  return new Promise((ok) => {
    let reponse = false;
    const f = feuille({
      titre,
      contenu: texte ? h('p.discret', texte) : null,
      actions: h('div.rangee-boutons', { style: { marginTop: '14px' } },
        h('button.bouton', { type: 'button', onclick: () => f.fermer() }, 'Annuler'),
        h('button.bouton', { type: 'button', classe: danger ? 'danger' : 'primaire', onclick: () => { reponse = true; f.fermer(); } }, oui)),
      onFermer: () => ok(reponse),
    });
  });
}

/** Exécute une action en affichant l'erreur éventuelle ; renvoie le résultat ou null. */
export async function tenter(f, { succes = null } = {}) {
  try {
    const r = await f();
    if (succes) annoncer(succes);
    return r ?? true;
  } catch (e) {
    console.error(e);
    annoncer(messageErreur(e), { erreur: true });
    return null;
  }
}

/* ---------- Éléments ---------- */

export function puceNiveau(cfg, n) {
  return h('span.puce.niveau', { classe: `niveau-${n}` }, cfg.niveaux[n]?.nom || '?');
}

export function jauge(part, classe = '') {
  return h('div.jauge', { classe }, h('i', { style: { width: `${Math.max(0, Math.min(1, part)) * 100}%` } }));
}

/* ---------- Cartel ---------- */

/**
 * Ce que l'on sait d'une œuvre. Restaurée (ou non possédée) : tout. Sinon,
 * comme pour un arrivage : support et siècle, plus mouvement et artiste avec
 * la bibliothèque, plus le titre avec les archives. La découverte de l'œuvre
 * pendant la restauration fait partie du jeu.
 */
export function cartel(app, o, fiche) {
  const cfg = app.jeu.cfg;
  const support = cfg.supports.find((s) => s.id === (o?.support || fiche?.support))?.nom || '?';
  const sc = siecle(o?.an ?? fiche?.an);
  const revele = o && o.progression < 1 ? effets(cfg, app.jeu.etat).revele : 2;
  const tout = !o || o.progression >= 1;
  return {
    connu: tout,
    titre: tout || revele >= 2 ? (fiche?.titre || o?.titre || '?') : `${support} · ${sc !== null ? siecleTexte(sc) : 'date inconnue'}`,
    artiste: tout || revele >= 1 ? (fiche?.artiste?.nom || o?.artiste?.nom || null) : null,
    mouvement: tout || revele >= 1 ? majuscule(fiche?.mouvement?.nom || o?.mouvement?.nom || null) : null,
    support,
  };
}

/* ---------- Rendu des œuvres ---------- */

const signees = new Map();

/** Adresse de l'image à afficher : personnalisée (URL signée) ou par défaut. */
export async function sourceImage(app, fiche, oeuvre, cote) {
  if (oeuvre?.imagePerso) {
    const c = signees.get(oeuvre.imagePerso);
    if (c && c.expire > Date.now()) return c.url;
    const url = await app.jeu.backend.urlSignee(oeuvre.imagePerso).catch(() => null);
    if (url) {
      signees.set(oeuvre.imagePerso, { url, expire: Date.now() + 50 * 60e3 });
      return url;
    }
  }
  return urlImage(fiche, cote);
}

/**
 * Charge l'image de l'œuvre, en se repliant sur l'image de secours du
 * catalogue si la source principale ne répond pas. Renvoie null sans image.
 */
export async function imageOeuvre(app, fiche, oeuvre, cote) {
  const url = await sourceImage(app, fiche, oeuvre, cote);
  const image = await chargerImage(url).catch(() => null);
  if (image || oeuvre?.imagePerso) return image;
  return chargerImage(urlSecours(fiche, cote)).catch(() => null);
}

export function graineOeuvre(id) {
  return `oeuvre:${id}`;
}

/**
 * Remplit `conteneur` avec l'œuvre à la progression donnée : une image
 * simple si elle est restaurée, sinon un canvas dégradé.
 */
export async function peindre(app, conteneur, { fiche, oeuvre, progression, support, id, cote = 600, remplir = false }) {
  const url = await sourceImage(app, fiche, oeuvre, cote);
  if (!conteneur.isConnected && conteneur.dataset.attache) return;
  if (progression >= 1 && url) {
    const secours = oeuvre?.imagePerso ? null : urlSecours(fiche, cote);
    const img = h('img', { src: url, alt: fiche?.titre || '', loading: 'lazy', referrerpolicy: 'no-referrer', decoding: 'async' });
    if (secours) img.addEventListener('error', () => { if (img.src !== secours) img.src = secours; }, { once: true });
    if (remplir) img.style.objectFit = 'cover';
    conteneur.replaceChildren(img);
    return;
  }
  const image = await imageOeuvre(app, fiche, oeuvre, cote);
  const r = image ? image.naturalWidth / image.naturalHeight : ratio(fiche);
  const c = document.createElement('canvas');
  const densite = Math.min(2, globalThis.devicePixelRatio || 1);
  const base = Math.round(cote * densite / 2);
  if (r >= 1) { c.width = base; c.height = Math.max(1, Math.round(base / r)); } else { c.height = base; c.width = Math.max(1, Math.round(base * r)); }
  dessiner(c, image, { progression, support: support || fiche?.support || 'peinture', graine: graineOeuvre(id ?? fiche?.id), rendu: app.jeu.cfg.rendu });
  if (remplir) c.style.objectFit = 'cover';
  conteneur.replaceChildren(c);
}

// Les vignettes se peignent quand elles approchent de l'écran, une à la fois :
// un canvas dégradé coûte quelques dizaines de millisecondes.
const file = [];
let enCours = false;
const observateur = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver((entrees) => {
    for (const e of entrees) {
      if (!e.isIntersecting) continue;
      observateur.unobserve(e.target);
      const t = e.target.__peindre;
      if (t) { file.push(t); vider(); }
    }
  }, { rootMargin: '200px' })
  : null;

async function vider() {
  if (enCours) return;
  enCours = true;
  while (file.length) {
    const t = file.shift();
    try { await t(); } catch (e) { console.warn(e); }
    await new Promise((r) => setTimeout(r, 0));
  }
  enCours = false;
}

export function peindrePlusTard(element, tache) {
  element.__peindre = tache;
  if (observateur) observateur.observe(element);
  else { file.push(tache); vider(); }
}

/**
 * L'œuvre dans son cadre : doré pour une peinture, baguette et passe-partout
 * pour une estampe ou une photographie, socle pour une sculpture. Avec
 * `hauteur`, le cadre a une taille fixe (la largeur suit les proportions de
 * l'image, bornée par `largeurMax`) ; sans, il remplit son conteneur.
 */
export function cadreOeuvre(app, { id, fiche, oeuvre, support, progression, hauteur = null, largeurMax = Infinity, cote = 360 }) {
  const s = support || oeuvre?.support || fiche?.support || 'peinture';
  const r = ratio(fiche);
  const c = h('div.cadre', { classe: `cadre-${s}` });
  if (hauteur) {
    let H = hauteur;
    let W = H * r;
    if (W > largeurMax) { W = largeurMax; H = W / r; }
    c.style.width = `${Math.round(W)}px`;
    c.style.height = `${Math.round(H)}px`;
  } else {
    c.classList.add('fluide');
    c.style.setProperty('--r', r);
  }
  peindrePlusTard(c, () => peindre(app, c, {
    fiche, oeuvre, progression: progression ?? oeuvre?.progression ?? 1, id, support: s, cote, remplir: true,
  }));
  return c;
}

/**
 * Vignette d'œuvre : la toile encadrée sur un pan de mur, niveau, titre.
 * `infos` : { id, fiche, oeuvre, progression, niveau, support, titre, sous,
 * onclick, coin }.
 */
export function vignette(app, infos) {
  const { id, fiche, oeuvre, onclick } = infos;
  const progression = infos.progression ?? oeuvre?.progression ?? 0;
  const niveau = infos.niveau ?? oeuvre?.niveau ?? fiche?.niveau ?? 0;
  return h('button.vignette', { type: 'button', onclick },
    h('div.toile', cadreOeuvre(app, { id, fiche, oeuvre, progression, support: infos.support ?? oeuvre?.support, cote: 360 })),
    h('div.coin', puceNiveau(app.jeu.cfg, niveau), infos.coin),
    progression > 0 && progression < 1 ? h('span.pourcent', pourcent(progression)) : null,
    h('div.cartel',
      h('div.titre', infos.titre ?? (oeuvre ? cartel(app, oeuvre, fiche).titre : fiche?.titre) ?? '?'),
      infos.sous !== undefined ? h('div.sous', infos.sous) : null));
}

/** Miniature carrée (listes de choix). */
export function miniature(app, { id, fiche, oeuvre }) {
  const boite = h('div', { style: { width: '100%', height: '100%' } });
  peindrePlusTard(boite, () => peindre(app, boite, {
    fiche, oeuvre, progression: oeuvre?.progression ?? 1, id, support: oeuvre?.support, cote: 200, remplir: true,
  }));
  return boite;
}

/* ---------- Murs ---------- */

// Couleurs de cimaise : bordeaux, sauge, bleu de Prusse, terre d'ombre,
// prune, vert bouteille, sienne brûlée, ardoise. Une salle à thème garde la
// couleur de son thème ; sans thème, elle suit son rang.
const MURS = ['#5e1d22', '#3f4d3d', '#1f3346', '#5a3a1e', '#3e2433', '#23392f', '#6e3121', '#33383d'];

export function couleurMur(espace, rang = 0) {
  if (espace?.theme) return MURS[empreinte(`${espace.theme.type}:${espace.theme.valeur}`) % MURS.length];
  return MURS[rang % MURS.length];
}

/* ---------- Portraits ---------- */

// La bibliothèque pèse ~370 Ko : elle ne se charge qu'à la première fiche.
let portraits = null;

/** Portrait dessiné d'un membre du personnel, toujours le même pour une graine. */
export function portrait(graine, classe = '') {
  const el = h('span.portrait', { classe, 'aria-hidden': 'true' });
  portraits ??= import('../vendor/portraits.js');
  portraits.then((m) => {
    el.innerHTML = m.portrait(String(graine), { backgroundColor: ['ead9bd', 'e3cfae', 'efe0c4', 'dcc9a8', 'e8d3c4'] });
  }).catch(() => {});
  return el;
}
