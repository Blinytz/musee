// Arrivages : œuvres proposées chaque lundi, à 0 % de restauration.

import { h, icone, nombre, dateJour, siecleTexte, ajouter } from '../dom.js';
import { vignette, puceNiveau } from '../composants.js';
import { effets, prixArrivage, siecle } from '../../moteur/regles.js';
import { reserveLibre } from '../../moteur/batiment.js';
import { prochainJourSemaine } from '../../moteur/temps.js';

export async function afficher(app, vue) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const jour = jeu.jour();
  const revele = effets(cfg, e).revele;
  const libre = reserveLibre(e);
  const arrivages = [...e.arrivages].sort((a, b) => b.jour - a.jour);

  ajouter(vue, h('div.section', h('h2', 'Arrivages'),
    h('span.aside', { style: { color: libre <= 0 ? 'var(--rouge)' : null } }, `Réserve ${e.batiment.reserve.places - libre}/${e.batiment.reserve.places}`)));

  if (!arrivages.length) {
    const prochain = prochainJourSemaine(jour, cfg.arrivages.jourSemaine);
    ajouter(vue, h('div.vide', `Prochain arrivage le ${dateJour(prochain, { weekday: 'long', day: 'numeric', month: 'long' })}`));
    return;
  }

  for (const a of arrivages) {
    const fiches = await app.catalogue.fiches(a.oeuvres.map((o) => o.id));
    const reste = a.expire - jour;
    ajouter(vue, 
      h('div.ligne.espace', { style: { margin: '14px 2px 8px' } },
        h('b', a.premier ? 'Premier arrivage' : `Arrivage du ${dateJour(a.jour)}`),
        h('span.tres-discret', reste <= 1 ? 'Dernier jour' : `${reste} jours`)),
      h('div.grille', a.oeuvres.map((ligne, i) => carte(app, e, cfg, a, ligne, fiches[i], revele, libre))),
    );
  }
}

function carte(app, e, cfg, a, ligne, fiche, revele, libre) {
  const support = cfg.supports.find((s) => s.id === ligne.support)?.nom || ligne.support;
  const s = siecle(fiche?.an);
  const titre = revele >= 2 ? (fiche?.titre || '?') : `${support} · ${s !== null ? siecleTexte(s) : 'date inconnue'}`;
  const sous = revele >= 1
    ? [fiche?.artiste?.nom, fiche?.mouvement?.nom].filter(Boolean).join(' · ') || '?'
    : '';
  const prix = ligne.offerte ? 0 : prixArrivage(cfg, e, ligne.niveau);
  const bouton = ligne.achetee
    ? h('button.bouton.petit.plein', { type: 'button', disabled: true }, icone('valider'), 'Acquise')
    : h('button.bouton.petit.plein', {
      type: 'button',
      classe: prix === 0 ? 'primaire' : 'or',
      disabled: libre <= 0,
      onclick: async (ev) => {
        ev.stopPropagation();
        ev.currentTarget.disabled = true;
        const ok = await app.agir('acheter', { arrivage: a.id, oeuvre: ligne.id, fiche }, { succes: 'En réserve' });
        if (!ok) ev.currentTarget.disabled = false;
      },
    }, prix === 0 ? 'Offerte' : `${nombre(prix)} ✦`);
  const v = vignette(app, {
    id: ligne.id, fiche, progression: 0, niveau: ligne.niveau, support: ligne.support, titre, sous,
    onclick: () => {},
  });
  v.style.cursor = 'default';
  return h('div.pile', { style: { gap: '6px' } }, v, bouton);
}

export { puceNiveau };
