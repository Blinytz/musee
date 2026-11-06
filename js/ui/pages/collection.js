// Collection : les arrivages de la semaine en tête, puis toutes les œuvres,
// où qu'elles soient, avec leur état, leur attrait et de quoi les déplacer
// d'un appui. Filtres par lieu, recherche par titre ou artiste.

import { h, vider, ajouter, icone, pourcent } from '../dom.js';
import { cadreOeuvre, cartel, puceNiveau } from '../composants.js';
import { compter } from '../../moteur/batiment.js';
import { nouveaute } from '../../moteur/regles.js';
import { actionsOeuvre, conservation, lieuTexte } from '../oeuvres.js';
import { afficher as afficherArrivages } from './arrivages.js';

const FILTRES = [
  ['tout', 'Toutes', () => true],
  ['salles', 'En salle', (o) => o.lieu === 'espace' || o.lieu === 'exposition'],
  ['reparer', 'À réparer', (o, cfg) => o.progression >= 1 && conservation(cfg, o).alerte && !o.travaux],
  ['reserve', 'Réserve', (o) => o.lieu === 'reserve'],
  ['atelier', 'Atelier', (o) => o.lieu === 'atelier'],
  ['privee', 'Repos', (o) => o.lieu === 'privee'],
  ['ailleurs', 'Ailleurs', (o) => ['pret', 'volee'].includes(o.lieu)],
];

export async function afficher(app, vue, { route }) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  // Les anciennes adresses ouvrent la vue avec le bon filtre.
  let filtre = route === 'reserve' || route === 'privee' ? route : (sessionStorage.getItem('musee_collection') || 'tout');
  let recherche = '';
  const toutes = Object.values(e.oeuvres);
  const ids = toutes.map((o) => o.id);
  const fiches = new Map();
  (await app.catalogue.fiches(ids)).forEach((f, i) => fiches.set(ids[i], f));

  const liste = h('div.collection');
  const puces = h('div.filtres');
  const champ = h('input', {
    type: 'search', placeholder: 'Titre ou artiste', autocomplete: 'off',
    oninput: () => { recherche = champ.value.trim().toLocaleLowerCase('fr-FR'); dessiner(); },
  });

  function dessiner() {
    try { sessionStorage.setItem('musee_collection', filtre); } catch { /* navigation privée */ }
    vider(puces, FILTRES.map(([id, nom, test]) => {
      const n = toutes.filter((o) => test(o, cfg)).length;
      if (!n && id !== 'tout' && id !== filtre) return null;
      return h('button.puce', { type: 'button', classe: id === filtre ? 'actif' : '', onclick: () => { filtre = id; dessiner(); } }, `${nom} ${n}`);
    }));
    const test = FILTRES.find((f) => f[0] === filtre)?.[2] || (() => true);
    const visibles = toutes.filter((o) => test(o, cfg)).filter((o) => {
      if (!recherche) return true;
      const c = cartel(app, o, fiches.get(o.id));
      return [c.titre, c.artiste, c.mouvement].filter(Boolean).join(' ').toLocaleLowerCase('fr-FR').includes(recherche);
    }).sort((a, b) => b.niveau - a.niveau || (b.usure || 0) - (a.usure || 0));
    vider(liste, visibles.length ? visibles.map((o) => ligne(app, o, fiches.get(o.id))) : h('div.vide', 'Aucune œuvre'));
  }

  await afficherArrivages(app, vue);
  ajouter(vue,
    h('div.section', h('h2', 'Collection'),
      h('span.aside', `Réserve ${compter(e, 'reserve')}/${e.batiment.reserve.places} · repos ${compter(e, 'privee')}/${e.batiment.privee.places}`)),
    h('label.recherche', icone('zoom'), champ),
    puces,
    liste);
  dessiner();
}

/** Une œuvre : sa miniature, son nom, où elle est, son état, et les actions. */
function ligne(app, o, fiche) {
  const cfg = app.jeu.cfg;
  const e = app.jeu.etat;
  const c = cartel(app, o, fiche);
  const etat = conservation(cfg, o);
  const fini = o.progression >= 1;
  const { boutons } = actionsOeuvre(app, o, { compact: true });
  const details = [
    lieuTexte(cfg, e, o),
    fini ? null : `restaurée à ${pourcent(o.progression)}`,
    fini && o.lieu === 'espace' ? `attrait ×${nouveaute(cfg, o.joursExpo).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}` : null,
  ].filter(Boolean).join(' · ');
  return h('div.oeuvre-ligne',
    h('button.oeuvre-miniature', { type: 'button', style: { '--mur': '#2a1d17' }, onclick: () => app.naviguer(`oeuvre/${o.id}`), 'aria-label': c.titre },
      cadreOeuvre(app, { id: o.id, fiche, oeuvre: o, hauteur: 54, largeurMax: 70, cote: 160 })),
    h('div.oeuvre-texte',
      h('button.oeuvre-titre', { type: 'button', onclick: () => app.naviguer(`oeuvre/${o.id}`) }, c.titre),
      h('div.ligne', { style: { gap: '6px', flexWrap: 'wrap' } }, puceNiveau(cfg, o.niveau), h('span.tres-discret', details)),
      fini ? h('div.etat-conservation', { classe: etat.alerte ? 'alerte' : '' },
        h('div.jauge', h('i', { style: { width: `${etat.part * 100}%` } })), h('span', etat.mot)) : null),
    boutons.length ? h('div.actions-oeuvre', boutons) : null);
}
