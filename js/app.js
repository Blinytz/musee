// Démarrage, navigation et ossature de l'application.

import { createRegistre } from './donnees/registre.js';
import { createLocal } from './donnees/local.js';
import { createCatalogue } from './donnees/catalogue.js';
import { createJeu } from './jeu.js';
import { h, vider, icone, nombre } from './ui/dom.js';
import { annoncer, messageErreur, tenter } from './ui/composants.js';
import { afficherSession, afficherBilan } from './ui/pages/session.js';
import { visiteursDuJour, espacesOuverts } from './moteur/visiteurs.js';
import { appliquerAmbiance } from './ui/theme.js';
import { finPrevue } from './moteur/actions.js';

const PAGES = {
  // Le plan du musée : l'accueil, et tout ce qui se gère sur le bâtiment.
  plan: () => import('./ui/pages/plan.js'),
  // La visite : les salles en perspective, l'accrochage.
  visite: () => import('./ui/pages/musee.js'),
  atelier: () => import('./ui/pages/atelier.js'),
  collection: () => import('./ui/pages/collection.js'),
  equipe: () => import('./ui/pages/equipe.js'),
  profil: () => import('./ui/pages/profil.js'),
  finances: () => import('./ui/pages/finances.js'),
  classement: () => import('./ui/pages/classement.js'),
  investir: () => import('./ui/pages/investir.js'),
  expositions: () => import('./ui/pages/expositions.js'),
  rapport: () => import('./ui/pages/rapport.js'),
  historique: () => import('./ui/pages/historique.js'),
  reglages: () => import('./ui/pages/reglages.js'),
  oeuvre: () => import('./ui/pages/oeuvre.js'),
  // Anciennes adresses (liens, notifications déjà envoyées).
  musee: () => import('./ui/pages/plan.js'),
  direction: () => import('./ui/pages/profil.js'),
  plus: () => import('./ui/pages/profil.js'),
  arrivages: () => import('./ui/pages/collection.js'),
  reserve: () => import('./ui/pages/collection.js'),
  privee: () => import('./ui/pages/collection.js'),
  personnel: () => import('./ui/pages/equipe.js'),
  securite: () => import('./ui/pages/equipe.js'),
};

// L'Atelier, au centre de la barre, est le cœur du jeu.
const ONGLETS = [
  { route: 'plan', nom: 'Plan', icone: 'plan', aussi: ['musee', 'profil', 'direction', 'plus', 'finances', 'investir', 'classement', 'rapport', 'expositions'] },
  { route: 'visite', nom: 'Visite', icone: 'visite', aussi: [] },
  { route: 'atelier', nom: 'Atelier', icone: 'atelier', centre: true, aussi: ['historique'] },
  { route: 'collection', nom: 'Collection', icone: 'collection', aussi: ['arrivages', 'reserve', 'privee', 'oeuvre'] },
  { route: 'equipe', nom: 'Équipe', icone: 'visiteurs', aussi: ['personnel', 'securite'] },
];

const parametresUrl = new URLSearchParams(location.search);
const demo = parametresUrl.has('demo');
// En démonstration seulement, un autre catalogue peut être désigné (essais).
const baseCatalogue = demo && /^[\w./-]+\/$/.test(parametresUrl.get('catalogue') || '') ? `./${parametresUrl.get('catalogue')}` : './catalogue/';
const catalogue = createCatalogue({ base: baseCatalogue });
const backend = demo ? createLocal({ catalogue }) : createRegistre();
const jeu = createJeu({ backend, catalogue });

const vue = document.getElementById('vue');
const entete = document.getElementById('entete');
const navigation = document.getElementById('navigation');

const fichesCache = new Map();
let nettoyage = null;
let solde = null;
let installation = null;

const app = {
  jeu,
  catalogue,
  demo,
  /** Fiche du catalogue, gardée en mémoire. */
  fiche(id) {
    if (!fichesCache.has(id)) fichesCache.set(id, catalogue.fiche(id).catch(() => null));
    return fichesCache.get(id);
  },
  naviguer(route) {
    if (location.hash === `#/${route}`) afficherRoute();
    else location.hash = `#/${route}`;
  },
  retour() {
    if (history.length > 1) history.back(); else app.naviguer('plan');
  },
  /** Exécute une action du jeu, affiche l'erreur éventuelle, rafraîchit le solde. */
  async agir(nom, params, options = {}) {
    const r = await tenter(() => jeu.executer(nom, params), options);
    if (r) rafraichirSolde();
    return r;
  },
  rafraichirSolde,
  get solde() { return solde; },
  get installation() { return installation; },
  installer: async () => {
    if (!installation) return;
    installation.prompt();
    await installation.userChoice.catch(() => null);
    installation = null;
    majInstallation();
  },
};

/* ---------- Installation ---------- */

// Boutons « Installer » des écrans sans en-tête (connexion, création) : ils
// apparaissent dès que Chrome propose l'installation.
const boutonsInstaller = new Set();
function boutonInstaller() {
  const b = h('button.bouton.plein', { type: 'button', hidden: !installation, onclick: () => app.installer() },
    icone('installer'), 'Installer l\'application');
  boutonsInstaller.add(b);
  return b;
}

function majInstallation() {
  for (const b of boutonsInstaller) {
    if (!b.isConnected) boutonsInstaller.delete(b);
    else b.hidden = !installation;
  }
  majEntete();
  if (['profil', 'reglages'].includes(routeCourante().nom)) afficherRoute({ garderDefilement: true });
}

async function rafraichirSolde() {
  try {
    solde = await backend.solde();
  } catch {
    solde = null;
  }
  majEntete();
}

/* ---------- Ossature ---------- */

function majEntete() {
  const e = jeu.etat;
  if (!e) { entete.hidden = true; navigation.hidden = true; return; }
  appliquerAmbiance(e.reglages?.ambiance);
  entete.hidden = false;
  navigation.hidden = false;
  const visiteurs = visiteursDuJour(jeu.cfg, e, jeu.jour());
  // Le nom ouvre le profil du musée ; le solde, ses finances.
  vider(entete,
    h('a.entete-nom', { href: '#/profil' },
      h('h1', e.nom),
      h('div.entete-statut', h('span.statut-plaque', jeu.cfg.statuts[e.statut].nom.replace(/^Musée /, '')), `${nombre(visiteurs)} visiteurs/j`)),
    installation ? h('button.installer-entete', { type: 'button', onclick: () => app.installer() }, icone('installer'), 'Installer') : null,
    h('button.solde', { type: 'button', onclick: () => app.naviguer('finances'), 'aria-label': 'Finances' },
      solde === null ? '?' : nombre(solde)));
  majNavigation();
}

function majNavigation() {
  const e = jeu.etat;
  const route = routeCourante().nom;
  const jour = jeu.jour();
  const arrivagesNeufs = e ? e.arrivages.reduce((n, a) => n + a.oeuvres.filter((o) => !o.achetee).length, 0) : 0;
  // Ce qui demande une décision sur le plan : salles fermées, piste, prêt.
  const urgences = e ? espacesOuverts(jeu.cfg, e, jour).fermes.length + (e.pistes || []).filter((p) => p.expire > jour).length + (e.prets?.demande ? 1 : 0) : 0;
  vider(navigation, ONGLETS.map((o) => {
    const actif = o.route === route || o.aussi.includes(route);
    const pastille = o.route === 'collection' ? arrivagesNeufs : o.route === 'plan' ? urgences : 0;
    return h('a', { href: `#/${o.route}`, classe: [actif ? 'actif' : '', o.centre ? 'centre' : ''].filter(Boolean).join(' '), 'aria-label': o.nom },
      o.centre ? h('span.centre-rond', icone(o.icone)) : icone(o.icone), h('span.onglet-nom', o.nom), pastille ? h('span.pastille', pastille) : null);
  }));
}

function routeCourante() {
  const [nom, ...reste] = location.hash.replace(/^#\/?/, '').split('/');
  return { nom: PAGES[nom] ? nom : 'plan', params: reste };
}

let jetonRoute = 0;
async function afficherRoute({ garderDefilement = false } = {}) {
  if (!jeu.etat) return;
  const jeton = ++jetonRoute;
  const { nom, params } = routeCourante();
  const defilement = window.scrollY;
  if (typeof nettoyage === 'function') nettoyage();
  nettoyage = null;
  const module = await PAGES[nom]();
  if (jeton !== jetonRoute) return;
  document.body.dataset.route = nom;
  vider(vue);
  if (!garderDefilement) window.scrollTo(0, 0);
  try {
    nettoyage = await module.afficher(app, vue, { route: nom, params }) || null;
  } catch (e) {
    console.error(e);
    vider(vue, h('div.vide', messageErreur(e)));
  }
  if (garderDefilement) window.scrollTo(0, defilement);
  majNavigation();
}

// L'ambiance suit l'heure : on la revoit toutes les cinq minutes.
setInterval(() => { if (jeu.etat) appliquerAmbiance(jeu.etat.reglages?.ambiance); }, 5 * 60e3);

// Après chaque changement d'état, la page courante se redessine en gardant
// sa position ; plusieurs changements rapprochés n'en font qu'un.
let redessinPrevu = false;
function rafraichirVue() {
  if (redessinPrevu) return;
  redessinPrevu = true;
  queueMicrotask(() => {
    redessinPrevu = false;
    afficherRoute({ garderDefilement: true });
  });
}

/* ---------- Écrans d'accueil ---------- */

function ecranConnexion(erreur) {
  entete.hidden = true;
  navigation.hidden = true;
  const email = h('input', { type: 'email', autocomplete: 'username', required: true, placeholder: 'Adresse' });
  const mdp = h('input', { type: 'password', autocomplete: 'current-password', required: true, placeholder: 'Mot de passe' });
  const bouton = h('button.bouton.or.plein', { type: 'submit' }, 'Se connecter');
  const formulaire = h('form.pile', {
    onsubmit: async (ev) => {
      ev.preventDefault();
      bouton.disabled = true;
      try {
        await backend.connexion(email.value.trim(), mdp.value);
        await demarrer();
      } catch (e) {
        annoncer(messageErreur(e), { erreur: true });
        bouton.disabled = false;
      }
    },
  }, email, mdp, bouton);
  vider(vue, h('div.accueil', h('div.pile', { style: { gap: '14px' } },
    h('div.plaque', 'Musée'),
    erreur ? h('p.discret', { style: { textAlign: 'center' } }, erreur) : null,
    formulaire,
    h('a.tres-discret', { href: '?demo', style: { textAlign: 'center' } }, 'Démonstration'),
    boutonInstaller())));
}

function ecranCreation() {
  entete.hidden = true;
  navigation.hidden = true;
  const nom = h('input', { type: 'text', maxlength: 60, required: true, placeholder: 'Nom du musée', autocomplete: 'off' });
  const bouton = h('button.bouton.or.plein', { type: 'submit' }, 'Ouvrir');
  vider(vue, h('div.accueil', h('form.pile', {
    style: { gap: '14px' },
    onsubmit: async (ev) => {
      ev.preventDefault();
      if (!nom.value.trim()) return;
      bouton.disabled = true;
      const ok = await tenter(() => jeu.creer(nom.value));
      if (ok) {
        await rafraichirSolde();
        app.naviguer('collection');
        afficherRoute();
      } else bouton.disabled = false;
    },
  },
  h('div.plaque', 'Votre musée'),
  nom, bouton, boutonInstaller())));
  nom.focus();
}

/* ---------- Session, bilan, rapport ---------- */

let sessionAffichee = null;
const CLE_BILAN = 'musee_bilan_vu';

async function verifierSession() {
  const e = jeu.etat;
  if (!e) return;
  if (e.session) {
    // Une session libre arrivée à 7 h se met en pause et reste à valider.
    if (jeu.maintenant() >= finPrevue(e.session)) await tenter(() => jeu.terminerSession());
    if (jeu.etat?.session && !sessionAffichee) {
      sessionAffichee = afficherSession(app, { onFin: () => { sessionAffichee = null; } });
    }
  }
  if (!jeu.etat?.session && sessionAffichee) {
    sessionAffichee.fermer();
    sessionAffichee = null;
  }
  verifierBilan();
}

// Le bilan se déduit de la dernière session de l'historique : peu importe qui
// l'a terminée (minuterie, retour au premier plan, arrêt anticipé), il ne
// s'affiche qu'une fois.
function verifierBilan() {
  const e = jeu.etat;
  const s = e?.sessions?.[e.sessions.length - 1];
  if (!s || e.session) return;
  let vu = null;
  try { vu = localStorage.getItem(CLE_BILAN); } catch { /* stockage indisponible */ }
  if (vu === s.id || jeu.maintenant() - s.fin > 24 * 3600e3) return;
  try { localStorage.setItem(CLE_BILAN, s.id); } catch { /* stockage indisponible */ }
  const maitrise = e.maitrise[s.support] || 0;
  rafraichirSolde();
  afficherBilan(app, {
    session: s,
    progressionAvant: s.avant,
    progressionApres: s.apres,
    eclats: s.eclats,
    minutes: s.minutes,
    perdu: s.perdu,
    maitriseAvant: maitrise - s.minutes,
    maitriseApres: maitrise,
    finances: s.recettes === undefined ? null : {
      recettes: s.recettes, indemnites: s.indemnites || 0, salaires: s.salaires, accueil: s.accueil || 0, entretien: s.entretien || 0,
      assurance: s.assurance || 0, fournitures: s.fournitures || 0, primes: s.primes || 0, arrieresPayes: 0, arrieresRestants: s.arrieres || 0, impot: s.impot, net: s.eclats,
    },
  });
}

// Passage de statut : une annonce plein écran, une seule fois par statut.
const CLE_STATUT = 'musee_statut_vu';
async function verifierStatut() {
  const e = jeu.etat;
  if (!e || e.session || e.statut === 0) return;
  let vu = 0;
  try { vu = Number(localStorage.getItem(CLE_STATUT) || 0); } catch { /* stockage indisponible */ }
  if (vu >= e.statut) return;
  try { localStorage.setItem(CLE_STATUT, String(e.statut)); } catch { /* stockage indisponible */ }
  const { annoncerStatut } = await import('./ui/pages/rapport.js');
  annoncerStatut(app, e.statut);
}

function verifierRapport() {
  const e = jeu.etat;
  const r = e?.rapports?.[e.rapports.length - 1];
  if (r && !r.vu && r.jour === jeu.jour() && r.veille && routeCourante().nom !== 'rapport' && !e.session) {
    app.naviguer('rapport');
  }
}

/* ---------- Démarrage ---------- */

async function demarrer() {
  appliquerAmbiance(jeu.etat?.reglages?.ambiance);
  vider(vue, h('div.vide', 'Ouverture du musée…'));
  if (!backend.estConnecte()) { ecranConnexion(); return; }
  try {
    await jeu.charger();
  } catch (e) {
    console.error(e);
    if (e.status === 401) { backend.deconnexion(); ecranConnexion('Session expirée'); return; }
    vider(vue, h('div.vide', messageErreur(e)), h('button.bouton.plein', { onclick: () => demarrer() }, 'Réessayer'));
    return;
  }
  if (!jeu.etat) { ecranCreation(); return; }
  await rafraichirSolde();
  verifierRapport();
  await afficherRoute();
  verifierSession();
  verifierStatut();
}

// Le solde se relit après chaque changement d'état : un versement arrive
// après l'écriture de la session, jamais avant.
let relectureSolde = null;
jeu.ecouter(() => {
  majEntete();
  verifierSession();
  verifierStatut();
  rafraichirVue();
  clearTimeout(relectureSolde);
  relectureSolde = setTimeout(rafraichirSolde, 400);
});

window.addEventListener('hashchange', () => afficherRoute());

// Retour au premier plan : jours à rattraper, session échue, nouvelle version.
async function auRetour() {
  if (document.visibilityState !== 'visible' || !jeu.etat) return;
  await tenter(() => jeu.rattraper());
  await rafraichirSolde();
  verifierSession();
  verifierRapport();
  verifierVersion();
}
document.addEventListener('visibilitychange', auRetour);
window.addEventListener('focus', auRetour);
setInterval(() => { if (jeu.etat?.session) verifierSession(); }, 15000);

// Une PWA laissée ouverte garde le code du premier lancement : on compare
// l'estampille publiée et on recharge si aucune saisie n'est en cours.
let versionChargee = null;
async function verifierVersion() {
  try {
    const r = await fetch('./version.json', { cache: 'no-store' });
    if (!r.ok) return;
    const { version } = await r.json();
    if (versionChargee === null) { versionChargee = version; return; }
    if (version !== versionChargee) {
      const saisie = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
      if (!saisie && !jeu.etat?.session) location.reload();
    }
  } catch { /* hors ligne */ }
}
verifierVersion();

// Chrome Android croit chaque nouvelle appli de blinytz.github.io déjà
// installée : on propose notre propre bouton à partir de beforeinstallprompt.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installation = e;
  majInstallation();
});
window.addEventListener('appinstalled', () => {
  installation = null;
  majInstallation();
});

if ('serviceWorker' in navigator && !demo && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
}
if ('serviceWorker' in navigator && navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener?.('message', (ev) => {
    if (ev.data?.type === 'naviguer' && ev.data.route) app.naviguer(ev.data.route);
  });
}

app.rafraichirVue = rafraichirVue;
window.__musee = app;
demarrer();
