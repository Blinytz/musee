// Plan : le musée vu d'en haut, comme une maquette posée sur une table
// d'architecte. C'est l'accueil, et le lieu de toute la gestion du bâtiment.
// Trois modes : Musée (alertes de chaque pièce, journée, restauration),
// Construire (ce qui peut sortir de terre, et à quel prix), Équipe (glisser
// le badge d'un agent sur une salle pour l'y affecter).

import { h, vider, icone, nombre, pourcent, ajouter, dateJour } from '../dom.js';
import { feuille, confirmer, portrait, couleurMur, peindre, cartel, jauge, annoncer, messageErreur, cadreOeuvre } from '../composants.js';
import {
  espacesPublics, contenuEspace, compter, emplacementsAtelier, prixAile, prixSalle, aileDisponible,
  prixAgrandissement, prixReserve, prixPrivee, prixAtelier,
} from '../../moteur/batiment.js';
import { espacesOuverts, apports, multiplicateurGlobal, tauxHoraire } from '../../moteur/visiteurs.js';
import { catalogueInvestissements } from '../../moteur/actions.js';
import { heuresChantier, chargesHoraires } from '../../moteur/charges.js';
import { probabilites, lieuxSecurises, affectation, materielDe, risqueMusee, MENACES } from '../../moteur/securite.js';
import { avecNiveaux, role, masseSalariale, effetsPersonnel } from '../../moteur/personnel.js';
import { niveau, niveauMaitrise, frequentationAnnualisee, bilanFinancier } from '../../moteur/regles.js';
import { etape } from '../../rendu/restauration.js';
import { urlImage } from '../../rendu/images.js';
import { choisirDuree } from './atelier.js';
import { choisirTheme } from './musee.js';
import { ficheSalle, fichePersonne, ficheDossier, ficheMateriel, ficheMenace, risqueSalle, niveauRisque } from '../fiches.js';

const CELLULE = 68;
const ECART = 6;
const MUR = 24;
const COLONNES = 5;
const MODES = [['musee', 'Musée', 'musee'], ['construire', 'Construire', 'investir'], ['equipe', 'Équipe', 'affecter']];
const CLE_MODE = 'musee_plan_mode';

const pct = (p) => `${(p * 100).toLocaleString('fr-FR', { maximumFractionDigits: p < 0.1 ? 1 : 0 })} %`;
const numeroSalle = (s) => (/^s(\d+)$/.test(s.id) ? s.id.slice(1) : null);

export async function afficher(app, vue) {
  const { jeu } = app;
  let mode = 'musee';
  try { mode = sessionStorage.getItem(CLE_MODE) || 'musee'; } catch { /* navigation privée */ }
  if (!MODES.some(([id]) => id === mode)) mode = 'musee';
  const changer = (m) => { try { sessionStorage.setItem(CLE_MODE, m); } catch { /* navigation privée */ } app.rafraichirVue(); };

  const e = jeu.etat;
  const cfg = jeu.cfg;
  const jour = jeu.jour();
  const ctx = contexte(cfg, e, jour);
  // Les œuvres accrochées paraissent en miniature sur les murs de la maquette.
  const exposees = Object.values(e.oeuvres).filter((o) => o.lieu === 'espace').map((o) => o.id);
  ctx.fiches = new Map();
  try { (await app.catalogue.fiches(exposees)).forEach((f, i) => ctx.fiches.set(exposees[i], f)); } catch { /* hors ligne : cadres vides */ }

  ajouter(vue,
    h('div.onglets.modes-plan', MODES.map(([id, nom, ic]) => h('button', {
      type: 'button', classe: id === mode ? 'actif' : '', onclick: () => changer(id),
    }, icone(ic), nom))),
    maquette(app, ctx, mode),
  );
  if (mode === 'musee') ajouter(vue, tableauDeBord(app, ctx));
  if (mode === 'construire') ajouter(vue, listeConstruire(app, ctx));
  if (mode === 'equipe') return ajouterTiroir(app, ctx, vue);
  return null;
}

/* ---------- Contexte ---------- */

function contexte(cfg, e, jour) {
  const ouverture = espacesOuverts(cfg, e, jour);
  const m = multiplicateurGlobal(cfg, e, jour);
  const parEspace = new Map();
  for (const a of apports(cfg, e, jour)) parEspace.set(a.espace, (parEspace.get(a.espace) || 0) + a.valeur * m);
  const agents = avecNiveaux(cfg, e).filter((x) => role(cfg, x.role)?.menaces);
  return { cfg, e, jour, ouverture, parEspace, agents, p7: probabilites(cfg, e, jour), securises: new Set(lieuxSecurises(cfg, e).map((l) => l.id)) };
}

/* ---------- Disposition ---------- */

/**
 * Les pièces sur une grille : les ailes de l'arrière vers l'avant, la rangée
 * des services (accueil, poste de sécurité, atelier, réserve, collection
 * privée) au premier plan, les espaces particuliers en cinquième colonne.
 */
function disposition(ctx, mode) {
  const { cfg, e } = ctx;
  const b = e.batiment;
  const construire = mode === 'construire';
  const chantiers = e.chantiers || [];
  const lignes = [];
  const chantierAile = chantiers.find((c) => c.quoi === 'aile');
  if (chantierAile) lignes.push([{ type: 'chantier', span: 4, chantier: chantierAile, nom: chantierAile.nom }]);
  else if (construire && prixAile(cfg, e) !== null) {
    lignes.push([{ type: 'fantome', span: 4, quoi: 'aile', nom: `Aile ${b.ailes + 1}`, prix: prixAile(cfg, e), heures: heuresChantier(cfg, 'aile') }]);
  }
  const salleAchetable = construire && aileDisponible(cfg, e) && !chantiers.some((c) => c.quoi === 'salle');
  let rang = 0;
  const rangs = new Map();
  for (const s of espacesPublics(e)) rangs.set(s.id, rang++);
  for (let a = b.ailes; a >= 1; a--) {
    const salles = b.salles.filter((s) => s.aile === a);
    const ligne = [];
    let fantomePose = false;
    for (let c = 0; c < cfg.batiment.aile.sallesMax; c++) {
      const s = salles[c];
      if (s?.chantier) ligne.push({ type: 'chantier', span: 1, chantier: chantiers.find((x) => x.cible === s.id), nom: s.nom || `Salle ${numeroSalle(s) || ''}` });
      else if (s) ligne.push({ type: 'salle', span: 1, id: s.id, espace: s, rang: rangs.get(s.id) });
      else if (salleAchetable && a === aileDisponible(cfg, e) && !fantomePose) {
        fantomePose = true;
        ligne.push({ type: 'fantome', span: 1, quoi: 'salle', nom: 'Salle', prix: prixSalle(cfg, e), heures: heuresChantier(cfg, 'salle') });
      } else ligne.push({ type: 'vide', span: 1 });
    }
    lignes.push(ligne);
  }
  // Espaces particuliers : acquis, en chantier, ou à bâtir.
  const particuliers = [];
  for (const type of ['cabinet', 'jardin', 'exposition']) {
    const def = cfg.espaces[type];
    const ch = chantiers.find((c) => c.quoi === 'espace' && c.cible === type);
    if (type === 'exposition' ? b.exposition : b[type]) {
      particuliers.push(type === 'exposition' ? { type: 'exposition', span: 1, id: 'exposition' } : { type: 'salle', span: 1, id: type, espace: espacesPublics(e).find((x) => x.id === type), rang: rangs.get(type) });
    } else if (ch) particuliers.push({ type: 'chantier', span: 1, chantier: ch, nom: def.nom });
    else if (construire && e.statut >= def.statutMin) particuliers.push({ type: 'fantome', span: 1, quoi: `espace:${type}`, nom: def.nom, prix: def.prix, heures: heuresChantier(cfg, 'espace') });
  }
  // Les ailes portent les espaces particuliers sur leur cinquième colonne ;
  // s'il en manque, des annexes s'ajoutent à l'arrière.
  const ailes = lignes.filter((l) => l.length === cfg.batiment.aile.sallesMax);
  for (let i = 0; i < particuliers.length; i++) {
    const cible = ailes[ailes.length - 1 - i];
    if (cible) cible.push(particuliers[i]);
    else lignes.unshift([{ type: 'rien', span: 4 }, particuliers[i]]);
  }
  lignes.push([
    { type: 'accueil', span: 1, id: 'accueil' },
    { type: 'poste', span: 1, id: 'poste' },
    { type: 'atelier', span: 1, id: 'atelier' },
    { type: 'reserve', span: 1, id: 'reserve' },
    { type: 'privee', span: 1, id: 'privee' },
  ]);
  const tuiles = [];
  lignes.forEach((ligne, r) => {
    let c = 0;
    for (const t of ligne) {
      if (t.type !== 'rien') tuiles.push({ ...t, col: c, row: r });
      c += t.span;
    }
  });
  return { tuiles, lignes: lignes.length, colonnes: COLONNES };
}

/* ---------- Maquette ---------- */

function maquette(app, ctx, mode) {
  const { cfg, e } = ctx;
  const d = disposition(ctx, mode);
  const W = d.colonnes * CELLULE + (d.colonnes - 1) * ECART;
  const H = d.lignes * CELLULE + (d.lignes - 1) * ECART;
  const largeur = Math.min(680, (window.innerWidth || 390));
  const diag = (W + H) * Math.SQRT1_2;
  // Une marge pour les arbres autour du bâtiment.
  const s = Math.min(1.2, (largeur - 20) / ((W + H + 36) * Math.SQRT1_2));
  const demi = diag * 0.25 * s;
  const leve = MUR * 0.866 * s;
  const haut = 44;
  const cx = largeur / 2;
  const cy = haut + leve + demi;
  const hauteur = Math.round(cy + demi + 34 * s + 22);
  // Coordonnées écran d'un point du plateau.
  const ecran = (x, y) => {
    const dx = x - W / 2;
    const dy = y - H / 2;
    return [cx + s * Math.SQRT1_2 * (dx + dy), cy + s * 0.5 * Math.SQRT1_2 * (dy - dx)];
  };

  const plateau = h('div.plateau', {
    style: { left: `${cx - W / 2}px`, top: `${cy - H / 2}px`, width: `${W}px`, height: `${H}px`, transform: `scale(${s}) rotateX(60deg) rotateZ(-45deg)` },
  });
  const epingles = h('div.epingles');
  for (const [x, y, r] of arbres(W, H)) ajouter(plateau, h('span.arbre', { style: { left: `${x}px`, top: `${y}px`, '--r': `${r}px` } }, h('i'), h('i'), h('i')));
  for (const t of d.tuiles) {
    const x = t.col * (CELLULE + ECART);
    const y = t.row * (CELLULE + ECART);
    const w = t.span * CELLULE + (t.span - 1) * ECART;
    ajouter(plateau, tuile(app, ctx, t, mode, { left: x, top: y, width: w }));
    const [px, py] = ecran(x + w / 2, y + CELLULE / 2);
    const ep = epingle(app, ctx, t, mode);
    if (ep) {
      ep.style.left = `${px}px`;
      ep.style.top = `${py - leve - 4}px`;
      ajouter(epingles, ep);
    }
  }
  return h('section.maquette', { style: { height: `${hauteur}px` }, 'aria-label': 'Plan du musée' },
    h('div.maquette-ombre', { style: { left: `${cx - diag * s * 0.42}px`, top: `${cy + demi * 0.35}px`, width: `${diag * s * 0.84}px`, height: `${demi * 1.4}px` } }),
    plateau, epingles);
}

const SOLS = {
  salle: 'sol-bois', cabinet: 'sol-clair', jardin: 'sol-herbe', exposition: 'sol-sombre',
  accueil: 'sol-marbre', poste: 'sol-beton', atelier: 'sol-planches', reserve: 'sol-beton', privee: 'sol-sombre',
};
const MURS_SERVICES = { accueil: ['#e4d5b8', '#d3c2a2'], poste: ['#2b4660', '#1f3346'], atelier: ['#6e4a28', '#5a3a1e'], reserve: ['#4a5056', '#33383d'], privee: ['#4a2a3a', '#3e2433'], exposition: ['#2a2420', '#1f1a17'] };
const ICONES_SERVICES = { accueil: 'billet', poste: 'securite', atelier: 'atelier', reserve: 'reserve', privee: 'coffre', exposition: 'expositions' };

function tuile(app, ctx, t, mode, pos) {
  const { cfg, e } = ctx;
  const lieu = t.id || null;
  const classes = ['tuile', `tuile-${t.type}`];
  let sol = SOLS[t.type] || '';
  let murs = null;
  let decor = null;
  if (t.type === 'salle') {
    const s = t.espace;
    sol = SOLS[s.id] || SOLS.salle;
    const couleur = couleurMur(s, t.rang);
    murs = s.id === 'jardin' ? null : [couleur, couleur];
    const ids = contenuEspace(e, s.id).filter((x) => x !== null);
    const tableaux = ids.filter((id) => e.oeuvres[id].support !== 'sculpture');
    const sculptures = ids.filter((id) => e.oeuvres[id].support === 'sculpture');
    if (ctx.ouverture.fermes.includes(s.id)) classes.push('fermee');
    decor = [
      h('span.numero', numeroSalle(s) || (s.id === 'cabinet' ? icone('image') : '')),
      murs ? mursGarnis(ctx, tableaux) : null,
      s.id === 'jardin' ? h('span.bosquets', [0, 1].map(() => h('span.arbre', h('i'), h('i'), h('i')))) : null,
      socles(sculptures.length),
      ctx.ouverture.ouverts.has(s.id) ? foule(ctx, s.id, pos.width) : null,
      gardes(ctx, s.id),
    ];
  } else if (MURS_SERVICES[t.type]) {
    murs = MURS_SERVICES[t.type];
    decor = [h('span.numero.icone-sol', icone(ICONES_SERVICES[t.type])), t.type === 'atelier' ? chevalets(Math.min(3, compter(e, 'atelier'))) : null];
    if (t.type === 'exposition' && ctx.ouverture.fermes.includes('exposition')) classes.push('fermee');
    if (t.type === 'exposition' && ctx.ouverture.ouverts.has('exposition')) decor.push(foule(ctx, 'exposition', pos.width));
    if (t.type === 'accueil') decor.push(foule(ctx, 'accueil', pos.width, 3));
  } else if (t.type === 'chantier') sol = 'sol-chantier';
  else if (t.type === 'fantome') sol = 'sol-fantome';
  else if (t.type === 'vide') sol = 'sol-vide';
  const securisable = lieu && ctx.securises.has(lieu);
  const ouvrir = () => ouvrirTuile(app, ctx, t);
  return h('div', {
    classe: classes.join(' '),
    role: 'button', tabindex: t.type === 'vide' ? -1 : 0,
    'aria-label': nomTuile(ctx, t),
    dataset: { ...(lieu ? { lieu } : {}), ...(securisable ? { securisable: '1' } : {}) },
    style: { left: `${pos.left}px`, top: `${pos.top}px`, width: `${pos.width}px`, height: `${CELLULE}px`, '--h-mur': `${MUR}px` },
    onclick: t.type === 'vide' ? null : ouvrir,
    onkeydown: (ev) => { if (ev.key === 'Enter') ouvrir(); },
  },
  h('span.sol', { classe: [sol, murs ? 'eclaire' : ''].filter(Boolean).join(' ') }),
  murs ? h('span.mur-haut', { style: { backgroundColor: murs[0] } }) : null,
  murs ? h('span.mur-droit', { style: { backgroundColor: murs[1] } }) : null,
  decor);
}

/**
 * Les tableaux accrochés, en miniature sur les murs : quatre sur le mur du
 * fond, trois sur le mur de droite. Les vraies images du catalogue.
 */
function mursGarnis(ctx, ids) {
  if (!ids.length) return null;
  const cadre = (id) => {
    const o = ctx.e.oeuvres[id];
    const f = ctx.fiches?.get(id);
    const src = !o.imagePerso && f ? urlImage(f, 120) : null;
    return h('i', src ? h('img', { src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', onerror: (ev) => ev.currentTarget.remove() }) : null);
  };
  return [
    h('span.mur-haut.cadres', ids.slice(0, 4).map(cadre)),
    ids.length > 4 ? h('span.mur-droit.cadres', ids.slice(4, 7).map(cadre)) : null,
  ];
}

/** Les sculptures sur leur socle. */
function socles(n) {
  return n ? h('span.socles', Array.from({ length: Math.min(3, n) }, () => h('i'))) : null;
}

// Hasard stable : la même salle garde ses visiteurs aux mêmes endroits.
function hasard(texte, i, k) {
  let x = 2166136261;
  for (const c of `${texte}:${i}:${k}`) x = Math.imul(x ^ c.charCodeAt(0), 16777619);
  return ((x >>> 0) % 1000) / 1000;
}
const HABITS = ['#2b5a8a', '#b3361f', '#3d7a4f', '#c9a24f', '#6b4a7a', '#e8e0d0', '#2b1a14'];

/** Des visiteurs qui flânent : plus la salle attire, plus ils sont nombreux. */
function foule(ctx, lieu, largeur, fixe = null) {
  const n = fixe ?? Math.min(6, Math.max(1, Math.round((ctx.parEspace.get(lieu) || 0) / 350)));
  return h('span.foule', Array.from({ length: n }, (_, i) => h('i', {
    style: {
      left: `${10 + hasard(lieu, i, 1) * (largeur - 26)}px`,
      top: `${18 + hasard(lieu, i, 2) * (CELLULE - 36)}px`,
      background: HABITS[Math.floor(hasard(lieu, i, 5) * HABITS.length)],
      animationName: `flane${i % 3}`,
      animationDuration: `${9 + hasard(lieu, i, 3) * 9}s`,
      animationDelay: `-${(hasard(lieu, i, 4) * 9).toFixed(1)}s`,
    },
  })));
}

/** Les agents de sécurité à leur poste, près de l'entrée de la salle. */
function gardes(ctx, lieu) {
  const n = Math.min(2, ctx.agents.filter((x) => affectation(x).includes(lieu)).length);
  return n ? h('span.gardes', Array.from({ length: n }, () => h('i'))) : null;
}

/** Quelques arbres autour du bâtiment, sur la table. */
function arbres(W, H) {
  return [
    [-22, H * 0.2, 10], [-26, H * 0.55, 13], [-20, H * 0.88, 9],
    [W * 0.14, H + 20, 11], [W * 0.46, H + 24, 9], [W * 0.78, H + 20, 12],
    [W + 20, H * 0.62, 10], [W * 0.62, -20, 8],
  ];
}

function chevalets(n) {
  return n ? h('span.chevalets', Array.from({ length: n }, () => h('i'))) : null;
}

function nomTuile(ctx, t) {
  const { cfg } = ctx;
  if (t.type === 'salle') return t.espace.nom || cfg.espaces[t.espace.type]?.nom || t.espace.id;
  return {
    accueil: 'Accueil', poste: 'Poste de sécurité', atelier: 'Atelier', reserve: 'Réserve', privee: 'Collection privée',
    exposition: cfg.espaces.exposition.nom, chantier: `Chantier · ${t.nom}`, fantome: `Construire · ${t.nom}`, vide: 'Terrain',
  }[t.type] || t.type;
}

/* ---------- Épingles ---------- */

function epingle(app, ctx, t, mode) {
  const { cfg, e } = ctx;
  const ouvrir = () => ouvrirTuile(app, ctx, t);
  const pin = (classe, ...contenu) => h('button.epingle', { type: 'button', classe, onclick: ouvrir }, ...contenu);
  if (t.type === 'fantome') return pin('prix', icone('investir'), `${nombre(t.prix)} ✦`);
  if (t.type === 'chantier') {
    const c = t.chantier;
    return pin('sombre', icone('investir'), c ? `${Math.floor(c.fait)} / ${c.heures} h` : 'Chantier');
  }
  const lieu = t.id;
  if (mode === 'equipe') {
    if (!lieu || !ctx.securises.has(lieu)) return null;
    const ici = ctx.agents.filter((x) => affectation(x).includes(lieu));
    if (ctx.ouverture.fermes.includes(lieu)) return pin('alerte', icone('alerteBouclier'), 'Sans gardien');
    if (!ici.length) return null;
    return pin('avatars', ici.slice(0, 3).map((x) => portrait(x.nom)));
  }
  if (mode === 'construire') {
    if (t.type === 'salle' && t.espace.type !== 'jardin') {
      const p = prixAgrandissement(cfg, e, lieu);
      return p !== null ? pin('', icone('ajouter'), `${cfg.batiment.agrandissement.places} places`) : null;
    }
    if (t.type === 'reserve') return pin('', icone('ajouter'), `${cfg.batiment.reserve.places}`);
    if (t.type === 'privee') return pin('', icone('ajouter'), `${cfg.batiment.privee.places}`);
    if (t.type === 'atelier' && prixAtelier(cfg, e) !== null) return pin('', icone('ajouter'), '1');
    return null;
  }
  // Musée : ce qui demande une décision, sinon la fréquentation.
  if (ctx.ouverture.fermes.includes(lieu)) return pin('alerte', icone('alerteBouclier'), 'Fermée');
  if (t.type === 'salle') {
    const usees = contenuEspace(e, lieu).filter((id) => id !== null && (e.oeuvres[id].usure || 0) >= cfg.usure.aReparer).length;
    return usees ? pin('or', icone('reparer'), usees) : null;
  }
  if (t.type === 'atelier') {
    const o = oeuvreEnCours(e);
    return o ? pin('or', icone('atelier'), pourcent(o.progression)) : null;
  }
  if (t.type === 'reserve') return compter(e, 'reserve') >= e.batiment.reserve.places ? pin('alerte', 'Pleine') : null;
  if (t.type === 'poste') {
    const volees = Object.values(e.oeuvres).filter((o) => o.lieu === 'volee').length;
    return volees ? pin('alerte', icone('enquete'), volees) : null;
  }
  if (t.type === 'exposition') {
    const x = e.expositions?.courante;
    return x ? pin('', `${x.fin - ctx.jour} j`) : null;
  }
  return null;
}

function oeuvreEnCours(e) {
  return Object.values(e.oeuvres).filter((o) => o.lieu === 'atelier' && o.progression < 1).sort((a, b) => b.progression - a.progression)[0] || null;
}

/* ---------- Ouvrir une pièce ---------- */

function ouvrirTuile(app, ctx, t) {
  if (t.type === 'fantome') return acheter(app, { quoi: t.quoi, nom: t.nom, prix: t.prix, heures: t.heures });
  if (t.type === 'chantier') return ficheChantiers(app);
  if (t.type === 'salle' || t.type === 'exposition') return ficheEspace(app, t.id);
  if (t.type === 'accueil') return ficheAccueil(app);
  if (t.type === 'poste') return fichePoste(app);
  if (t.type === 'atelier') return ficheAtelier(app);
  if (t.type === 'reserve') return ficheStockage(app, 'reserve');
  if (t.type === 'privee') return ficheStockage(app, 'privee');
  return null;
}

async function acheter(app, { quoi, nom, prix, heures }) {
  const texte = [`${nombre(prix)} ✦`, heures ? `${heures} h de chantier` : null].filter(Boolean).join(' · ');
  if (!(await confirmer(nom, { texte, oui: 'Construire' }))) return;
  await app.agir('investir', { quoi }, { succes: heures ? `${nom} : chantier ouvert` : nom });
}

/** Une ligne d'achat dans une fiche : nom, effet, prix. */
function ligneAchat(app, { nom, sous, prix, refus, quoi, heures, avant }) {
  return h('div.materiel-ligne',
    h('div', h('b', nom), sous ? h('small', sous) : null),
    h('button.bouton.petit.or', {
      type: 'button', disabled: !!refus || prix === null || (app.solde !== null && app.solde < prix),
      onclick: async () => { avant?.(); await acheter(app, { quoi, nom, prix, heures }); },
    }, refus || `${nombre(prix)} ✦`));
}

function bloc(titre, ...contenu) {
  const enfants = contenu.flat().filter(Boolean);
  if (!enfants.length) return null;
  return h('div.fiche-bloc', titre ? h('div.fiche-legende', titre) : null, enfants);
}

/**
 * Fiche d'une salle (ou de l'exposition) : ses œuvres, sa fréquentation,
 * ses agents, sa sécurité, son agrandissement.
 */
export function ficheEspace(app, lieu) {
  const { jeu } = app;
  const cfg = jeu.cfg;
  const e = jeu.etat;
  const ctx = contexte(cfg, e, jeu.jour());
  const expo = lieu === 'exposition';
  const s = expo ? null : espacesPublics(e).find((x) => x.id === lieu);
  if (!expo && !s) return;
  const nom = expo ? cfg.espaces.exposition.nom : (s.nom || cfg.espaces[s.type]?.nom || lieu);
  const contenu = expo ? [] : contenuEspace(e, lieu);
  const garnies = contenu.filter((x) => x !== null);
  const fermee = ctx.ouverture.fermes.includes(lieu);
  const ici = ctx.agents.filter((x) => affectation(x).includes(lieu));
  const q = risqueSalle(ctx.p7, lieu);
  const n = niveauRisque(q);
  const installes = materielDe(e, lieu).map((id) => cfg.materielSalle.find((m) => m.id === id)?.nom || id);
  const agrandir = expo ? null : prixAgrandissement(cfg, e, lieu);
  let f = null;
  const fermer = () => f.fermer();

  f = feuille({
    titre: nom,
    contenu: h('div.fiche',
      h('div.ligne', { style: { flexWrap: 'wrap', gap: '6px' } },
        expo ? null : h('span.puce', `${garnies.length} / ${s.places} places`),
        s?.theme ? h('span.puce', s.theme.libelle) : null,
        h('span.puce', `${nombre(ctx.parEspace.get(lieu) || 0)} visiteurs par jour`)),
      fermee ? h('div.bandeau-alerte', icone('alerteBouclier'), h('span', h('b', 'Fermée'), h('small', 'Aucun gardien')),
        h('button.bouton.petit', { type: 'button', onclick: () => { fermer(); choisirAgent(app, lieu); } }, 'Affecter')) : null,
      garnies.length ? h('div.oeuvres-salle', garnies.map((id) => h('button.oeuvre-salle', {
        type: 'button', 'aria-label': e.oeuvres[id].titre, onclick: () => { fermer(); app.naviguer(`oeuvre/${id}`); },
      }, cadreOeuvre(app, { id, oeuvre: e.oeuvres[id], hauteur: 52, largeurMax: 80, cote: 160 })))) : null,
      bloc('Gardiennage',
        ici.map((x) => h('div.materiel-ligne',
          portrait(x.nom),
          h('div', h('b', x.nom), h('small', `${role(cfg, x.role)?.nom} · niveau ${x.niveau} · ${affectation(x).length} salle${affectation(x).length > 1 ? 's' : ''}`)),
          h('button.bouton.petit', {
            type: 'button',
            onclick: async () => { fermer(); await app.agir('affecter', { employe: x.id, lieux: affectation(x).filter((l) => l !== lieu) }); },
          }, 'Retirer'))),
        h('button.bouton.petit.plein', { type: 'button', onclick: () => { fermer(); choisirAgent(app, lieu); } }, icone('affecter'), 'Affecter un agent')),
      bloc('Sécurité',
        h('div.fiche-risque', h('b', { style: { color: n.couleur } }, pct(q)), h('span', 'par semaine')),
        installes.length ? h('div.ligne', { style: { flexWrap: 'wrap', gap: '6px' } }, installes.map((x) => h('span.puce', icone('valider'), x))) : null,
        h('button.bouton.petit.plein', { type: 'button', onclick: () => { fermer(); ficheSalle(app, lieu); } }, icone('securite'), 'Matériel et risque')),
      expo ? null : bloc('Bâtiment',
        agrandir !== null ? ligneAchat(app, {
          nom: `+${cfg.batiment.agrandissement.places} places`, sous: `${s.places} → ${Math.min(cfg.batiment.agrandissement.max, s.places + cfg.batiment.agrandissement.places)} · ${heuresChantier(cfg, 'agrandissement')} h de chantier`,
          prix: agrandir, quoi: `agrandir:${lieu}`, heures: heuresChantier(cfg, 'agrandissement'), avant: fermer,
        }) : null,
        h('div.rangee-boutons',
          h('button.bouton.petit', { type: 'button', onclick: () => { fermer(); choisirTheme(app, e, cfg, s); } }, 'Thème et nom'),
          h('button.bouton.petit', { type: 'button', onclick: () => { fermer(); app.naviguer(`visite/${lieu}`); } }, icone('visite'), 'Visiter'))),
      expo ? h('button.bouton.plein', { type: 'button', onclick: () => { fermer(); app.naviguer('expositions'); } }, icone('expositions'), 'Expositions et prêts') : null),
  });
}

/** Choisir l'agent à affecter à une salle : trois salles au plus chacun. */
export function choisirAgent(app, lieu) {
  const { jeu } = app;
  const cfg = jeu.cfg;
  const e = jeu.etat;
  const agents = avecNiveaux(cfg, e).filter((x) => role(cfg, x.role)?.menaces);
  const max = cfg.securite.sallesParAgent;
  let f = null;
  f = feuille({
    titre: 'Affecter',
    contenu: agents.length ? h('div.personnes', agents.map((x) => {
      const liste = affectation(x);
      const deja = liste.includes(lieu);
      return h('div.personne', { style: { cursor: 'default' } },
        portrait(x.nom),
        h('div.personne-texte', h('b', x.nom), h('small', `${role(cfg, x.role)?.nom} · niveau ${x.niveau} · ${liste.length} / ${max} salles`)),
        h('button.bouton.petit', {
          type: 'button', classe: deja ? '' : 'primaire', disabled: deja || liste.length >= max,
          onclick: async () => { f.fermer(); await app.agir('affecter', { employe: x.id, lieux: [...liste, lieu] }, { succes: `${x.nom} en poste` }); },
        }, deja ? 'Déjà là' : liste.length >= max ? 'Complet' : 'Affecter'));
    })) : h('div.vide', h('a', { href: '#/equipe', onclick: () => f.fermer() }, 'Recruter un gardien')),
  });
}

function ficheChantiers(app) {
  const e = app.jeu.etat;
  feuille({
    titre: 'Chantiers',
    contenu: h('div.pile', (e.chantiers || []).map((c, i) => h('div.carte.pile', { style: { gap: '8px' } },
      h('div.ligne.espace', h('b', c.nom), h('span.tres-discret.nombre', `${nombre(Math.floor(c.fait))} / ${c.heures} h`)),
      jauge(c.fait / c.heures),
      i ? h('div.tres-discret', 'En attente') : null))),
  });
}

function achatsCategorie(app, categories, fermer) {
  const { jeu } = app;
  return catalogueInvestissements(jeu.cfg, jeu.etat).filter((x) => categories.includes(x.categorie)).map((x) => (x.acquis
    ? h('div.materiel-ligne', h('div', h('b', x.nom)), h('span.puce', icone('valider'), 'Acquis'))
    : ligneAchat(app, { nom: x.nom, sous: effetsCourts(x.effets), prix: x.prix, refus: x.refus, quoi: x.id, avant: fermer })));
}

function effetsCourts(effets) {
  if (!effets) return null;
  const t = [];
  if (effets.revenus) t.push(`Revenus ×${effets.revenus.toLocaleString('fr-FR')}`);
  if (effets.satisfaction) t.push(`Satisfaction +${effets.satisfaction}`);
  if (effets.efficacite) t.push(`Efficacité +${Math.round(effets.efficacite * 100)} %`);
  if (effets.revele === 1) t.push('Mouvement et artiste révélés');
  if (effets.revele === 2) t.push('Titre révélé');
  if (effets.remise) t.push(`Arrivages -${Math.round(effets.remise * 100)} %`);
  return t.join(' · ') || null;
}

function ficheAccueil(app) {
  const e = app.jeu.etat;
  let f = null;
  const fermer = () => f.fermer();
  f = feuille({
    titre: 'Accueil',
    contenu: h('div.fiche',
      h('button.fiche-lien', { type: 'button', onclick: () => { fermer(); app.naviguer('finances'); } },
        h('span', h('b', 'Billet'), h('small', e.prixBillet === 0 ? 'Gratuit' : `${e.prixBillet} ✦`)), icone('droite')),
      bloc('Équipements', achatsCategorie(app, ['equipements'], fermer))),
  });
}

function fichePoste(app) {
  const { jeu } = app;
  const cfg = jeu.cfg;
  const e = jeu.etat;
  const p = risqueMusee(cfg, e, jeu.jour());
  const volees = Object.values(e.oeuvres).filter((o) => o.lieu === 'volee');
  let f = null;
  const fermer = () => f.fermer();
  f = feuille({
    titre: 'Poste de sécurité',
    contenu: h('div.fiche',
      h('div.menaces.deux', MENACES.map((m) => {
        const n = niveauRisque(p[m]);
        return h('button.menace', { type: 'button', onclick: () => { fermer(); ficheMenace(app, m); } },
          h('b', cfg.securite.menaces[m].nom), h('span.menace-valeur', { style: { color: n.couleur } }, pct(p[m])), h('small', 'par semaine'));
      })),
      volees.length ? bloc('Enquêtes', volees.map((o) => h('button.fiche-lien', { type: 'button', onclick: () => { fermer(); ficheDossier(app, o.id); } },
        h('span', h('b', o.titre)), icone('droite')))) : null,
      bloc('Matériel commun', catalogueInvestissements(cfg, e).filter((x) => x.categorie === 'securite').map((x) => h('button.fiche-lien', {
        type: 'button', onclick: () => { fermer(); ficheMateriel(app, x); },
      }, h('span', h('b', x.nom), h('small', x.acquis ? 'Acquis' : (x.refus || `${nombre(x.prix)} ✦`))), icone('droite'))))),
  });
}

function ficheAtelier(app) {
  const { jeu } = app;
  const cfg = jeu.cfg;
  const e = jeu.etat;
  const pa = prixAtelier(cfg, e);
  let f = null;
  const fermer = () => f.fermer();
  f = feuille({
    titre: 'Atelier',
    contenu: h('div.fiche',
      h('div.ligne', { style: { gap: '6px', flexWrap: 'wrap' } },
        h('span.puce', `${compter(e, 'atelier')} / ${emplacementsAtelier(cfg, e)} emplacements`)),
      bloc('Agrandir', pa !== null ? ligneAchat(app, { nom: '+1 emplacement', prix: pa, quoi: 'atelier', avant: fermer }) : h('div.fiche-ligne', 'Atelier au plus grand')),
      bloc('Outils et documentation', achatsCategorie(app, ['atelier', 'documentation'], fermer)),
      h('div.rangee-boutons',
        h('button.bouton', { type: 'button', onclick: () => { fermer(); ficheSalle(app, 'atelier'); } }, icone('securite'), 'Sécurité'),
        h('button.bouton.primaire', { type: 'button', onclick: () => { fermer(); app.naviguer('atelier'); } }, icone('atelier'), 'Ouvrir'))),
  });
}

function ficheStockage(app, lieu) {
  const { jeu } = app;
  const cfg = jeu.cfg;
  const e = jeu.etat;
  const reserve = lieu === 'reserve';
  const places = e.batiment[lieu].places;
  let f = null;
  const fermer = () => f.fermer();
  f = feuille({
    titre: reserve ? 'Réserve' : 'Collection privée',
    contenu: h('div.fiche',
      h('div.ligne', { style: { gap: '6px' } }, h('span.puce', `${compter(e, lieu)} / ${places} places`)),
      bloc('Agrandir', ligneAchat(app, {
        nom: `+${cfg.batiment[lieu].places} places`, prix: reserve ? prixReserve(cfg, e) : prixPrivee(cfg, e), quoi: lieu, avant: fermer,
      })),
      h('div.rangee-boutons',
        reserve ? h('button.bouton', { type: 'button', onclick: () => { fermer(); ficheSalle(app, 'reserve'); } }, icone('securite'), 'Sécurité') : null,
        h('button.bouton.primaire', {
          type: 'button',
          onclick: () => { fermer(); try { sessionStorage.setItem('musee_collection', reserve ? 'reserve' : 'privee'); } catch { /* navigation privée */ } app.naviguer('collection'); },
        }, icone('collection'), 'Voir'))),
  });
}

/* ---------- Mode Musée : la journée ---------- */

function tableauDeBord(app, ctx) {
  const { cfg, e, jour } = ctx;
  const annualisee = frequentationAnnualisee(cfg, e.historique);
  const suivant = cfg.statuts[e.statut + 1];
  const o = oeuvreEnCours(e);
  const heure = bilanFinancier(cfg, {
    tauxHoraire: tauxHoraire(cfg, e, jour), salaireHoraire: masseSalariale(cfg, e),
    charges: chargesHoraires(cfg, e, jour, o?.niveau ?? 0), minutes: 60, abattement: effetsPersonnel(cfg, e).abattement || 0,
  });
  const liste = alertes(app, ctx);
  return h('div.tableau',
    h('div.indicateurs',
      h('a.indicateur', { href: '#/profil' }, 'Réputation', h('b', Math.round(e.reputation))),
      h('a.indicateur', { href: '#/finances' }, 'Net par heure', h('b', { classe: heure.net < 0 ? 'baisse' : '' }, `${heure.net > 0 ? '+' : ''}${nombre(heure.net)} ✦`)),
      h('a.indicateur', { href: '#/profil' }, suivant ? suivant.nom.replace(/^Musée /, 'Vers ') : 'Statut',
        h('b', suivant ? pourcent(Math.min(1, annualisee / suivant.seuil)) : 'Max'))),
    carteRestaurer(app, ctx, o),
    liste.length ? h('section.a-traiter',
      h('div.section', h('h2', 'À traiter'), h('span.pastille-titre', liste.length)),
      h('div.carte.alertes', liste.map((a) => h('button.alerte-ligne', { type: 'button', onclick: a.faire },
        h('span.alerte-icone', { style: { '--teinte': a.teinte } }, icone(a.icone)),
        h('span.alerte-texte', h('b', a.titre), a.sous ? h('small', a.sous) : null),
        h('span.alerte-action', a.action))))) : null);
}

/** Tout ce qui attend une décision, chaque ligne menant à son action. */
function alertes(app, ctx) {
  const { cfg, e, jour } = ctx;
  const l = [];
  const ROUGE = 'var(--rouge)';
  const OR = 'var(--or)';
  const VERT = 'var(--vert)';
  const BLEU = '#4a7aa8';
  const noms = new Map(lieuxSecurises(cfg, e).map((x) => [x.id, x.nom]));
  for (const id of ctx.ouverture.fermes) {
    l.push({ icone: 'alerteBouclier', teinte: ROUGE, titre: `${noms.get(id) || id} fermée`, sous: 'Aucun gardien', action: 'Affecter', faire: () => choisirAgent(app, id) });
  }
  for (const p of (e.pistes || []).filter((x) => x.expire > jour)) {
    l.push({ icone: 'enquete', teinte: BLEU, titre: `Piste à ${p.ville}`, sous: `Avant le ${dateJour(p.expire)}`, action: 'Ouvrir', faire: () => ficheDossier(app, p.oeuvre) });
  }
  if (e.prets?.demande) l.push({ icone: 'prets', teinte: BLEU, titre: 'Demande de prêt', sous: e.prets.demande.musee?.nom || null, action: 'Voir', faire: () => app.naviguer('expositions') });
  const usees = Object.values(e.oeuvres).filter((o) => o.lieu === 'espace' && !o.travaux && (o.usure || 0) >= cfg.usure.aReparer);
  for (const o of usees.slice(0, 2)) {
    l.push({ icone: 'reparer', teinte: OR, titre: cartel(app, o, null).titre, sous: `Usée à ${pourcent(o.usure)}`, action: 'Réparer', faire: () => app.naviguer(`oeuvre/${o.id}`) });
  }
  if (usees.length > 2) {
    l.push({
      icone: 'reparer', teinte: OR, titre: `${usees.length - 2} autres à réparer`, action: 'Voir',
      faire: () => { try { sessionStorage.setItem('musee_collection', 'reparer'); } catch { /* navigation privée */ } app.naviguer('collection'); },
    });
  }
  const neuves = e.arrivages.reduce((n, a) => n + a.oeuvres.filter((x) => !x.achetee).length, 0);
  if (neuves) l.push({ icone: 'arrivages', teinte: OR, titre: 'Arrivage', sous: `${neuves} caisse${neuves > 1 ? 's' : ''}`, action: 'Ouvrir', faire: () => app.naviguer('collection') });
  const candidats = (e.personnel?.candidats || []).filter((c) => c.expire > jour);
  if (candidats.length) {
    const metiers = [...new Set(candidats.map((c) => role(cfg, c.role)?.nom.toLowerCase()))].slice(0, 2).join(', ');
    l.push({ icone: 'recruter', teinte: VERT, titre: `${candidats.length} candidat${candidats.length > 1 ? 's' : ''}`, sous: metiers, action: 'Voir', faire: () => app.naviguer('equipe') });
  }
  if ((e.personnel?.arrieres || 0) > 0) l.push({ icone: 'finances', teinte: ROUGE, titre: 'Arriérés', sous: `${nombre(e.personnel.arrieres)} ✦`, action: 'Voir', faire: () => app.naviguer('finances') });
  return l;
}

/** L'œuvre en cours à l'atelier et de quoi lancer une session. */
function carteRestaurer(app, ctx, o) {
  const { cfg, e } = ctx;
  if (!o) {
    const aRestaurer = Object.values(e.oeuvres).some((x) => x.lieu === 'reserve' && x.progression < 1);
    return h('a.carte-restaurer', { href: aRestaurer ? '#/atelier' : '#/collection' },
      h('span.toile', h('span.vide-toile', icone('atelier'))),
      h('span.texte', h('b', 'Atelier libre'), h('small', aRestaurer ? 'Choisir une œuvre' : 'Arrivages')),
      h('span.lancer', icone('droite')));
  }
  const toile = h('span.toile-image');
  app.fiche(o.id).then((fiche) => peindre(app, toile, { fiche, oeuvre: o, progression: o.progression, id: o.id, support: o.support, cote: 200, remplir: true })).catch(() => {});
  const requise = niveau(cfg, o.niveau).maitrise;
  const bloque = niveauMaitrise(cfg, e.maitrise[o.support] || 0) < requise;
  return h('div.carte-restaurer',
    h('span.toile', toile),
    h('span.texte',
      h('b', cartel(app, o, null).titre),
      h('small', bloque ? `Maîtrise ${requise} requise` : `${etape(cfg.rendu, o.progression).nom} · ${pourcent(o.progression)}`),
      jauge(o.progression, 'or')),
    bloque
      ? h('a.lancer', { href: '#/atelier', 'aria-label': 'Atelier' }, icone('droite'))
      : h('button.lancer', { type: 'button', 'aria-label': 'Restaurer', disabled: !!e.session, onclick: () => choisirDuree(app, o) }, icone('lancer')));
}

/* ---------- Mode Construire ---------- */

function listeConstruire(app, ctx) {
  const { cfg, e } = ctx;
  const items = catalogueInvestissements(cfg, e).filter((x) => x.categorie === 'batiment' || x.categorie === 'espaces' || x.id === 'atelier');
  const heures = (id) => (id === 'aile' ? heuresChantier(cfg, 'aile') : id === 'salle' ? heuresChantier(cfg, 'salle') : id.startsWith('espace:') ? heuresChantier(cfg, 'espace') : 0);
  return h('div',
    (e.chantiers || []).length ? h('div.carte.pile', { style: { gap: '8px', marginTop: '12px' } },
      e.chantiers.map((c, i) => h('div.pile', { style: { gap: '6px' } },
        h('div.ligne.espace', h('b', c.nom), h('span.tres-discret.nombre', i ? 'En attente' : `${nombre(Math.floor(c.fait))} / ${c.heures} h`)),
        i ? null : jauge(c.fait / c.heures)))) : null,
    h('div.carte', { style: { marginTop: '12px', padding: '4px 14px' } }, items.filter((x) => !x.acquis).map((x) => ligneAchat(app, {
      nom: x.nom, sous: heures(x.id) ? `${heures(x.id)} h de chantier` : null, prix: x.prix, refus: x.refus, quoi: x.id, heures: heures(x.id),
    }))),
    h('a.entree', { href: '#/investir', style: { marginTop: '12px', borderRadius: '20px', background: 'var(--carte)', boxShadow: 'var(--ombre-carte)' } },
      icone('investir'), h('span', 'Tous les investissements'), icone('droite')));
}

/* ---------- Mode Équipe : glisser un badge sur une salle ---------- */

function ajouterTiroir(app, ctx, vue) {
  const { cfg } = ctx;
  const max = cfg.securite.sallesParAgent;
  const tiroir = h('div.tiroir',
    ctx.agents.map((x) => {
      const n = affectation(x).length;
      return h('button.badge-agent', { type: 'button', dataset: { employe: x.id }, onclick: () => fichePersonne(app, x) },
        h('span.bandeau', h('i')),
        portrait(x.nom),
        h('b', x.nom.split(' ')[0]),
        h('small', role(cfg, x.role)?.nom.split(' ')[0]),
        h('span.couverture', Array.from({ length: max }, (_, i) => h('i', { classe: i < n ? 'pleine' : '' }))));
    }),
    h('a.badge-agent.recruter', { href: '#/equipe' }, h('span.rond', icone('recruter')), h('b', 'Recruter')));
  ajouter(vue, tiroir);
  return activerBadges(app, vue);
}

/**
 * Glisser un badge sur une pièce : l'agent la couvre en plus des siennes.
 * Souris : dès que le pointeur bouge. Doigt : après un appui long.
 */
function activerBadges(app, racine) {
  let etat = null;

  function demarrer(ev) {
    const source = ev.target.closest('.badge-agent[data-employe]');
    if (!source || ev.button > 0) return;
    const tactile = ev.pointerType === 'touch';
    etat = { source, id: source.dataset.employe, x: ev.clientX, y: ev.clientY, actif: false, cible: null, fantome: null, tactile,
      minuterie: tactile ? setTimeout(() => activer(), 240) : null };
  }

  function activer() {
    if (!etat || etat.actif) return;
    etat.actif = true;
    etat.source.classList.add('soulevee');
    document.body.classList.add('glisse');
    etat.fantome = etat.source.cloneNode(true);
    etat.fantome.classList.add('fantome-badge');
    ajouter(document.body, etat.fantome);
    placer(etat.x, etat.y);
    navigator.vibrate?.(12);
  }

  function placer(x, y) {
    etat.fantome.style.left = `${x}px`;
    etat.fantome.style.top = `${y}px`;
  }

  function bouger(ev) {
    if (!etat) return;
    if (!etat.actif) {
      const d = Math.hypot(ev.clientX - etat.x, ev.clientY - etat.y);
      if (etat.tactile) { if (d > 10) annuler(); return; }
      if (d > 6) activer(); else return;
    }
    ev.preventDefault();
    placer(ev.clientX, ev.clientY);
    // Le fantôme ne doit pas masquer la pièce visée.
    etat.fantome.style.visibility = 'hidden';
    const sous = document.elementFromPoint(ev.clientX, ev.clientY);
    etat.fantome.style.visibility = '';
    const cible = sous?.closest('.tuile[data-securisable]') || null;
    if (cible !== etat.cible) {
      etat.cible?.classList.remove('cible');
      etat.cible = cible;
      cible?.classList.add('cible');
    }
  }

  async function lacher(ev) {
    if (!etat) return;
    const { actif, cible, id, source } = etat;
    annuler();
    if (!actif) return;
    ev.preventDefault();
    source.addEventListener('click', (c) => { c.stopPropagation(); c.preventDefault(); }, { capture: true, once: true });
    if (!cible) return;
    const x = app.jeu.etat.personnel.employes.find((y) => y.id === id);
    if (!x) return;
    const lieu = cible.dataset.lieu;
    const liste = affectation(x);
    if (liste.includes(lieu)) return;
    const max = app.jeu.cfg.securite.sallesParAgent;
    if (liste.length >= max) { annoncer(`${x.nom} couvre déjà ${max} salles`, { erreur: true }); return; }
    try {
      await app.jeu.executer('affecter', { employe: id, lieux: [...liste, lieu] });
    } catch (e) {
      annoncer(messageErreur(e), { erreur: true });
    }
  }

  function annuler() {
    if (!etat) return;
    clearTimeout(etat.minuterie);
    etat.fantome?.remove();
    etat.cible?.classList.remove('cible');
    etat.source.classList.remove('soulevee');
    document.body.classList.remove('glisse');
    etat = null;
  }

  const bloquer = (ev) => { if (etat?.actif) ev.preventDefault(); };
  racine.addEventListener('pointerdown', demarrer);
  window.addEventListener('pointermove', bouger, { passive: false });
  window.addEventListener('pointerup', lacher);
  window.addEventListener('pointercancel', annuler);
  window.addEventListener('touchmove', bloquer, { passive: false });
  racine.addEventListener('contextmenu', (ev) => { if (ev.target.closest('.badge-agent')) ev.preventDefault(); });
  return () => {
    annuler();
    racine.removeEventListener('pointerdown', demarrer);
    window.removeEventListener('pointermove', bouger);
    window.removeEventListener('pointerup', lacher);
    window.removeEventListener('pointercancel', annuler);
    window.removeEventListener('touchmove', bloquer);
  };
}
