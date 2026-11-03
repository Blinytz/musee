// Réserve et collection privée.

import { h, vider, ajouter } from '../dom.js';
import { vignette, cartel } from '../composants.js';

export async function afficher(app, vue, { route }) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const prive = route === 'privee';
  const lieu = prive ? 'privee' : 'reserve';
  const capacite = prive ? e.batiment.privee.places : e.batiment.reserve.places;
  const oeuvres = Object.values(e.oeuvres).filter((o) => o.lieu === lieu)
    .sort((a, b) => b.niveau - a.niveau || b.progression - a.progression);

  let filtre = sessionStorage.getItem(`musee_filtre_${lieu}`) || 'tout';
  const grille = h('div.grille');
  const onglets = h('div.onglets');

  async function dessiner() {
    try { sessionStorage.setItem(`musee_filtre_${lieu}`, filtre); } catch { /* navigation privée */ }
    const liste = oeuvres.filter((o) => filtre === 'tout'
      || (filtre === 'restaurer' && o.progression < 1)
      || (filtre === 'restaurees' && o.progression >= 1));
    vider(onglets, ...[['tout', 'Tout'], ['restaurer', 'À restaurer'], ['restaurees', 'Restaurées']].map(([id, nom]) => h('button', {
      type: 'button', classe: filtre === id ? 'actif' : '', onclick: () => { filtre = id; dessiner(); },
    }, nom)));
    const fiches = await app.catalogue.fiches(liste.map((o) => o.id));
    vider(grille, ...liste.map((o, i) => vignette(app, {
      id: o.id, fiche: fiches[i], oeuvre: o,
      sous: (() => { const c = cartel(app, o, fiches[i]); return [c.artiste, c.connu ? c.support : null].filter(Boolean).join(' · '); })(),
      onclick: () => app.naviguer(`oeuvre/${o.id}`),
    })));
    if (!liste.length) vider(grille, h('div.vide', { style: { gridColumn: '1 / -1' } }, 'Vide'));
  }

  ajouter(vue, 
    h('div.section', h('h2', prive ? 'Collection privée' : 'Réserve'),
      h('span.aside', { style: { color: oeuvres.length > capacite ? 'var(--rouge)' : null } }, `${oeuvres.length}/${capacite}`)),
    prive ? null : onglets,
    h('div', { style: { marginTop: '12px' } }, grille),
    h('div', { style: { marginTop: '16px' } }, h('a.bouton.plein', { href: '#/investir' }, prive ? 'Agrandir la collection' : 'Agrandir la réserve')),
  );
  if (prive) filtre = 'tout';
  await dessiner();
}
