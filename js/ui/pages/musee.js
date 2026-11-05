// Écran Musée : les salles comme des murs peints, les œuvres accrochées
// dans leurs cadres, la réserve à accrocher, et la carte « Restaurer »
// toujours à portée de pouce. Accrochage par glisser-déposer.

import { h, vider, icone, siecleTexte, ajouter, majuscule, pourcent } from '../dom.js';
import { feuille, miniature, puceNiveau, annoncer, messageErreur, cadreOeuvre, couleurMur, peindre, cartel } from '../composants.js';
import { espacesPublics, contenuEspace, refusAccrochage } from '../../moteur/batiment.js';
import { espacesOuverts } from '../../moteur/visiteurs.js';
import { estConforme, valeurTheme, niveau, niveauMaitrise } from '../../moteur/regles.js';
import { etape } from '../../rendu/restauration.js';
import { choisirDuree } from './atelier.js';
import { probabilites } from '../../moteur/securite.js';
import { ficheSalle, risqueSalle, niveauRisque } from '../fiches.js';

export async function afficher(app, vue) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const jour = jeu.jour();
  const fiches = new Map();
  const ids = Object.keys(e.oeuvres).map(Number);
  (await app.catalogue.fiches(ids)).forEach((f, i) => fiches.set(ids[i], f));

  ajouter(vue,
    plan(app, e, cfg, fiches, jour, espacesOuverts(cfg, e, jour)),
    carteRestaurer(app, e, cfg, fiches),
  );
  return activerGlisser(app, vue);
}

/* ---------- Plan ---------- */

// Hauteur d'accrochage selon le niveau : un trésor domine le mur.
const hauteurCadre = (n) => 76 + 14 * (n || 0);

function plan(app, e, cfg, fiches, jour, ouverture) {
  const racine = h('div');
  const espaces = espacesPublics(e);
  const largeurMax = Math.min(680, window.innerWidth || 390) - 70;
  const p7 = probabilites(cfg, e, jour);
  let rang = 0;
  const murs = [];
  for (let a = 1; a <= e.batiment.ailes; a++) {
    const salles = espaces.filter((s) => s.type === 'salle' && s.aile === a);
    if (e.batiment.ailes > 1) murs.push(h('div.aile-titre', `Aile ${a}`));
    if (salles.length) {
      for (const s of salles) murs.push(salle(app, e, cfg, s, fiches, ouverture, rang++, largeurMax, p7));
    } else {
      murs.push(h('section.mur', { style: { '--mur': couleurMur(null, rang++) } },
        h('div.mur-vide', h('a.bouton.or.petit', { href: '#/investir' }, icone('ajouter'), 'Nouvelle salle'))));
    }
  }
  for (const s of espaces.filter((x) => x.type !== 'salle')) murs.push(salle(app, e, cfg, s, fiches, ouverture, rang++, largeurMax, p7));
  // Les chantiers : un mur sous échafaudage, qui avance pendant les sessions.
  for (const c of e.chantiers || []) {
    murs.push(h('section.mur.travaux',
      h('div.mur-vide', h('a.plaque', { href: '#/investir' }, c.nom, h('small', `Chantier · ${Math.floor(c.fait)} / ${c.heures} h`)))));
  }
  if (e.batiment.exposition) {
    const x = e.expositions.courante;
    murs.push(h('section.mur', { style: { '--mur': '#1f1a17' } },
      h('div.mur-vide',
        h('a.plaque', { href: '#/expositions' },
          x ? x.theme.libelle : 'Exposition temporaire',
          h('small', x ? `${x.oeuvres.length + x.emprunts.length} œuvres · ${x.fin - jour} j` : 'Aucune en cours')))));
  }
  // Le premier mur donne sa couleur à l'en-tête et à la barre d'état.
  const premier = murs.find((m) => m.classList.contains('mur'));
  if (premier) {
    premier.classList.add('premier');
    document.body.style.setProperty('--mur-entete', premier.style.getPropertyValue('--mur'));
  }
  ajouter(racine, murs, bac(app, e, cfg, fiches));
  return racine;
}

function salle(app, e, cfg, s, fiches, ouverture, rang, largeurMax, p7) {
  const risque = risqueSalle(p7, s.id);
  const contenu = contenuEspace(e, s.id);
  const theme = s.theme;
  const conformes = contenu.filter((id) => id !== null && estConforme(e.oeuvres[id], theme)).length;
  const garnies = contenu.filter((id) => id !== null).length;
  const fermee = ouverture?.fermes.includes(s.id);
  return h('section.mur', { dataset: { espace: s.id }, classe: fermee ? 'fermee' : '', style: { '--mur': couleurMur(s, rang) } },
    h('div.accrochage', contenu.map((id, i) => {
      const o = id !== null ? e.oeuvres[id] : null;
      const hors = o && theme && !estConforme(o, theme);
      const usee = o && (o.usure || 0) >= cfg.usure.aReparer;
      return h('button.place', {
        type: 'button',
        classe: o ? 'occupee' : 'libre',
        style: o ? null : { width: '50px', height: '64px' },
        dataset: { espace: s.id, place: i, ...(o ? { oeuvre: id } : {}) },
        'aria-label': o ? o.titre : 'Place libre',
        onclick: () => (o ? app.naviguer(`oeuvre/${id}`) : choisirOeuvre(app, e, cfg, s, i, fiches)),
      }, o ? [
        cadreOeuvre(app, { id, fiche: fiches.get(id), oeuvre: o, hauteur: hauteurCadre(o.niveau), largeurMax, cote: 400 }),
        hors ? h('span.hors-theme') : null,
        usee ? h('span.a-reparer', { title: 'À réparer' }, icone('atelier')) : null,
      ]
        : icone('ajouter'));
    })),
    h('div.mur-pied',
      h('button.plaque', { type: 'button', onclick: () => choisirTheme(app, e, cfg, s) },
        s.nom || cfg.espaces[s.type]?.nom || s.id,
        h('small', [theme ? theme.libelle : 'Sans thème', theme && garnies ? `${conformes}/${garnies}` : null].filter(Boolean).join(' · '))),
      h('span.puce', `${garnies}/${s.places}`),
      // Le risque de la semaine dans cette salle : un appui ouvre sa sécurité.
      garnies ? h('button.puce', { type: 'button', style: { color: niveauRisque(risque).couleur === 'var(--vert)' ? null : 'var(--laiton-clair)' }, onclick: () => ficheSalle(app, s.id) },
        icone('securite'), `${(risque * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`) : null,
      fermee ? h('a.puce.alerte', { href: '#/personnel' }, 'Fermée') : null));
}

/** Œuvres restaurées disponibles pour l'accrochage, glissables vers une place. */
function bac(app, e, cfg, fiches) {
  const libres = Object.values(e.oeuvres).filter((o) => o.progression >= 1 && !o.travaux
    && (o.usure || 0) < cfg.usure.maxExposable && (o.lieu === 'reserve' || o.lieu === 'privee' || o.lieu === 'atelier'));
  return h('section.mur.reserve-mur', { style: { '--mur': '#2a1d17' } },
    h('div.bac-titre', h('span', `À accrocher · ${libres.length}`), h('a', { href: '#/collection' }, 'Collection')),
    h('div.bac', { dataset: { bac: '1' }, classe: libres.length ? '' : 'vide-bac' },
      libres.length ? libres.map((o) => h('button.place.occupee', {
        type: 'button', dataset: { oeuvre: o.id, origine: o.lieu }, 'aria-label': o.titre,
        onclick: () => app.naviguer(`oeuvre/${o.id}`),
      }, cadreOeuvre(app, { id: o.id, fiche: fiches.get(o.id), oeuvre: o, hauteur: 70, largeurMax: 120, cote: 240 })))
        : h('div.tres-discret', { style: { color: 'var(--creme-2)' } }, 'Rien à accrocher')));
}

/* ---------- Restaurer ---------- */

/**
 * L'œuvre en cours à l'atelier, sa progression, et de quoi lancer une
 * session en deux appuis. Sans œuvre en cours : le chemin vers l'atelier
 * ou les arrivages.
 */
function carteRestaurer(app, e, cfg, fiches) {
  const enAtelier = Object.values(e.oeuvres).filter((o) => o.lieu === 'atelier');
  const o = enAtelier.filter((x) => x.progression < 1).sort((a, b) => b.progression - a.progression)[0];
  if (!o) {
    const aRestaurer = Object.values(e.oeuvres).some((x) => x.lieu === 'reserve' && x.progression < 1);
    return h('div.restaurer',
      h('div.restaurer-toile', { style: { display: 'grid', placeItems: 'center', color: 'var(--creme-2)' } }, icone('atelier')),
      h('div.restaurer-texte', h('b', 'Atelier libre')),
      aRestaurer
        ? h('a.bouton.primaire', { href: '#/atelier' }, 'Choisir')
        : h('a.bouton.primaire', { href: '#/arrivages' }, 'Arrivages'));
  }
  const fiche = fiches.get(o.id);
  const toile = h('div.restaurer-toile');
  peindre(app, toile, { fiche, oeuvre: o, progression: o.progression, id: o.id, support: o.support, cote: 160, remplir: true });
  const requise = niveau(cfg, o.niveau).maitrise;
  const actuelle = niveauMaitrise(cfg, e.maitrise[o.support] || 0);
  const bloque = actuelle < requise;
  return h('div.restaurer',
    toile,
    h('div.restaurer-texte',
      h('b', cartel(app, o, fiche).titre),
      h('div.ligne', h('div.jauge', h('i', { style: { width: `${o.progression * 100}%` } })), h('span', pourcent(o.progression))),
      h('div.tres-discret', { style: { fontSize: '12px', marginTop: '2px' } }, bloque ? `Maîtrise ${requise} requise` : etape(cfg.rendu, o.progression).nom)),
    bloque
      ? h('a.bouton', { href: '#/atelier' }, 'Atelier')
      : h('button.bouton.primaire', { type: 'button', disabled: !!e.session, onclick: () => choisirDuree(app, o) }, 'Restaurer'));
}

/* ---------- Choix ---------- */

function choisirOeuvre(app, e, cfg, s, place, fiches) {
  const candidates = Object.values(e.oeuvres)
    .filter((o) => o.lieu !== 'espace' || o.espace !== s.id)
    .filter((o) => !refusAccrochage(cfg, e, o, s.id))
    .filter((o) => ['reserve', 'privee', 'atelier', 'espace'].includes(o.lieu))
    .sort((a, b) => (a.lieu === 'espace') - (b.lieu === 'espace') || b.niveau - a.niveau);
  const f = feuille({
    titre: s.nom || cfg.espaces[s.type]?.nom,
    contenu: candidates.length ? h('div.pile', candidates.map((o) => h('button.carte.ligne', {
      type: 'button', style: { textAlign: 'left', width: '100%' },
      onclick: async () => {
        f.fermer();
        await app.agir('deplacer', { oeuvre: o.id, vers: { lieu: 'espace', espace: s.id, place } });
      },
    },
    h('div', { style: { width: '48px', height: '60px', flex: 'none', borderRadius: '6px', overflow: 'hidden' } }, miniature(app, { id: o.id, fiche: fiches.get(o.id), oeuvre: o })),
    h('div', { style: { flex: 1, minWidth: 0 } },
      h('div', { style: { fontFamily: 'var(--titre)', fontSize: '17px' } }, o.titre),
      h('div.tres-discret', [o.artiste?.nom, lieuTexte(e, o)].filter(Boolean).join(' · '))),
    puceNiveau(cfg, o.niveau))))
      : h('div.vide', 'Aucune œuvre restaurée ne peut aller ici'),
  });
}

function lieuTexte(e, o) {
  if (o.lieu === 'espace') return e.batiment.salles.find((s) => s.id === o.espace)?.nom || o.espace;
  return { reserve: 'Réserve', privee: 'Collection privée', atelier: 'Atelier' }[o.lieu] || '';
}

/** Valeurs de thème possibles, tirées des œuvres possédées. */
export function valeursTheme(cfg, e, type) {
  const vues = new Map();
  for (const o of Object.values(e.oeuvres)) {
    const v = valeurTheme(o, type);
    if (v === null) continue;
    let libelle;
    if (type === 'artiste') libelle = o.artiste?.nom;
    else if (type === 'mouvement') libelle = majuscule(o.mouvement?.nom);
    else if (type === 'pays') libelle = majuscule(o.pays?.nom);
    else if (type === 'siecle') libelle = siecleTexte(v);
    else libelle = cfg.supports.find((x) => x.id === v)?.pluriel || v;
    const prec = vues.get(v);
    vues.set(v, { valeur: v, libelle, n: (prec?.n || 0) + 1 });
  }
  return [...vues.values()].sort((a, b) => b.n - a.n || String(a.libelle).localeCompare(String(b.libelle)));
}

function choisirTheme(app, e, cfg, s) {
  let type = s.theme?.type || 'mouvement';
  const liste = h('div.pile');
  const onglets = h('div.onglets');
  const nom = h('input', { type: 'text', value: s.nom || '', maxlength: 40, placeholder: 'Nom' });
  function dessiner() {
    vider(onglets, ...cfg.themes.map((t) => h('button', {
      type: 'button', classe: t.id === type ? 'actif' : '', onclick: () => { type = t.id; dessiner(); },
    }, t.nom)));
    const valeurs = valeursTheme(cfg, e, type);
    vider(liste, 
      h('button.bouton.plein', { type: 'button', onclick: () => appliquer(null) }, 'Sans thème'),
      ...valeurs.map((v) => h('button.carte.ligne.espace', {
        type: 'button', style: { width: '100%' },
        classe: s.theme?.type === type && s.theme?.valeur === v.valeur ? 'actif' : '',
        onclick: () => appliquer({ type, valeur: v.valeur, libelle: v.libelle }),
      }, h('span', v.libelle), h('span.tres-discret', v.n))),
      valeurs.length ? null : h('div.vide', 'Aucune œuvre ne porte ce critère'));
  }
  async function appliquer(theme) {
    f.fermer();
    await app.agir('definirTheme', { espace: s.id, theme });
  }
  dessiner();
  const f = feuille({
    titre: s.nom || cfg.espaces[s.type]?.nom,
    contenu: h('div.pile',
      s.type === 'salle' ? h('form.ligne', {
        onsubmit: async (ev) => { ev.preventDefault(); f.fermer(); await app.agir('renommerSalle', { espace: s.id, nom: nom.value }); },
      }, nom, h('button.bouton', { type: 'submit' }, 'Renommer')) : null,
      onglets, liste),
  });
}

/* ---------- Glisser-déposer ---------- */

/**
 * Glisser une œuvre (place occupée ou bac) vers une place, ou vers le bac
 * pour la décrocher. Souris : dès que le pointeur bouge. Doigt : après un
 * appui long, pour laisser le défilement normal au simple glissé.
 */
function activerGlisser(app, racine) {
  let etat = null;

  function demarrer(ev) {
    const source = ev.target.closest('[data-oeuvre]');
    if (!source || ev.button > 0) return;
    const tactile = ev.pointerType === 'touch';
    etat = {
      source, id: Number(source.dataset.oeuvre), x: ev.clientX, y: ev.clientY,
      actif: false, fantome: null, cible: null, tactile,
      minuterie: tactile ? setTimeout(() => activer(), 260) : null,
    };
  }

  function activer() {
    if (!etat || etat.actif) return;
    etat.actif = true;
    document.body.classList.add('glisse');
    etat.source.classList.add('soulevee');
    // Les places où l'œuvre ne peut pas aller se grisent pendant le geste.
    const o = app.jeu.etat.oeuvres[etat.id];
    for (const p of racine.querySelectorAll('.place[data-espace]')) {
      if (o && refusAccrochage(app.jeu.cfg, app.jeu.etat, o, p.dataset.espace)) p.classList.add('interdite');
    }
    defiler();
    etat.fantome = h('div.fantome', etat.source.firstElementChild?.cloneNode(true));
    const c = etat.source.querySelector('canvas');
    const copie = etat.fantome.querySelector('canvas');
    if (c && copie) copie.getContext('2d').drawImage(c, 0, 0);
    ajouter(document.body, etat.fantome);
    placerFantome(etat.x, etat.y);
    navigator.vibrate?.(12);
  }

  function placerFantome(x, y) {
    etat.fantome.style.left = `${x}px`;
    etat.fantome.style.top = `${y}px`;
  }

  // Près du haut ou du bas de l'écran, la page défile toute seule : on peut
  // porter une œuvre de l'étagère jusqu'à la première salle.
  function defiler() {
    if (!etat?.actif) return;
    const marge = 90;
    const y = etat.yCourant ?? etat.y;
    const bas = window.innerHeight - 110;
    let pas = 0;
    if (y < marge) pas = -Math.ceil((marge - y) / 5);
    else if (y > bas - marge) pas = Math.ceil((y - (bas - marge)) / 5);
    if (pas) window.scrollBy(0, pas);
    etat.defilement = requestAnimationFrame(defiler);
  }

  function bouger(ev) {
    if (!etat) return;
    if (!etat.actif) {
      const d = Math.hypot(ev.clientX - etat.x, ev.clientY - etat.y);
      if (etat.tactile) { if (d > 10) annuler(); return; }
      if (d > 6) activer(); else return;
    }
    ev.preventDefault();
    etat.yCourant = ev.clientY;
    placerFantome(ev.clientX, ev.clientY);
    const sous = document.elementFromPoint(ev.clientX, ev.clientY);
    const touchee = sous?.closest('.place[data-espace], [data-bac]') || null;
    const cible = touchee?.classList.contains('interdite') ? null : touchee;
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
    // Le clic qui suit le lâcher ne doit pas ouvrir la fiche.
    source.addEventListener('click', (c) => { c.stopPropagation(); c.preventDefault(); }, { capture: true, once: true });
    if (!cible) return;
    const vers = cible.dataset.bac
      ? { lieu: 'reserve' }
      : { lieu: 'espace', espace: cible.dataset.espace, place: Number(cible.dataset.place) };
    if (vers.lieu === 'reserve' && source.dataset.origine) return;
    try {
      await app.jeu.executer('deplacer', { oeuvre: id, vers });
    } catch (e) {
      annoncer(messageErreur(e), { erreur: true });
    }
  }

  function annuler() {
    if (!etat) return;
    clearTimeout(etat.minuterie);
    cancelAnimationFrame(etat.defilement);
    etat.fantome?.remove();
    etat.cible?.classList.remove('cible');
    etat.source.classList.remove('soulevee');
    for (const p of racine.querySelectorAll('.interdite')) p.classList.remove('interdite');
    document.body.classList.remove('glisse');
    etat = null;
  }

  // Sur écran tactile, seul un touchmove non passif peut empêcher le
  // défilement une fois le glisser engagé.
  const bloquer = (ev) => { if (etat?.actif) ev.preventDefault(); };
  racine.addEventListener('pointerdown', demarrer);
  window.addEventListener('pointermove', bouger, { passive: false });
  window.addEventListener('pointerup', lacher);
  window.addEventListener('pointercancel', annuler);
  window.addEventListener('touchmove', bloquer, { passive: false });
  racine.addEventListener('contextmenu', (ev) => { if (ev.target.closest('[data-oeuvre]')) ev.preventDefault(); });

  return () => {
    annuler();
    window.removeEventListener('pointermove', bouger);
    window.removeEventListener('pointerup', lacher);
    window.removeEventListener('pointercancel', annuler);
    window.removeEventListener('touchmove', bloquer);
  };
}

