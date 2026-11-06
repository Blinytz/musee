// Profil du musée : son statut et sa fréquentation, puis les écrans de suivi
// (classement, rapport, historique, expositions, investissements, réglages).

import { h, icone, nombre, grand, ajouter } from '../dom.js';
import { jauge } from '../composants.js';
import { placesPubliques } from '../../moteur/batiment.js';
import { visiteursDuJour } from '../../moteur/visiteurs.js';
import { frequentationAnnualisee } from '../../moteur/regles.js';

export async function afficher(app, vue) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const jour = jeu.jour();
  const rang = e.classement?.rang;

  ajouter(vue,
    app.installation ? h('button.bouton.primaire.plein.installer', { type: 'button', onclick: () => app.installer() }, icone('installer'), 'Installer l\'application') : null,
    facade(e, cfg),
    h('div.chiffres', { style: { marginTop: '12px' } },
      h('div.chiffre', h('span', icone('visiteurs'), 'Visiteurs par jour'), h('b', nombre(visiteursDuJour(cfg, e, jour)))),
      h('div.chiffre', h('span', icone('reputation'), 'Réputation'), h('b', Math.round(e.reputation)), h('small', `Satisfaction ${Math.round(e.satisfaction)}`)),
      h('div.chiffre', h('span', icone('musee'), 'Places'), h('b', nombre(placesPubliques(e)))),
      h('div.chiffre', h('span', icone('classement'), 'Classement'), h('b', rang ? `${nombre(rang)}e` : '?'))),
    h('div.entrees', { style: { marginTop: '16px' } },
      entree('classement', 'Classement', 'classement'),
      entree('rapport', 'Rapport du jour', 'rapport'),
      entree('historique', 'Historique', 'historique'),
      entree('expositions', 'Expositions et prêts', 'expositions', e.prets?.demande ? 'Demande' : (e.expositions?.courante ? 'En cours' : null)),
      entree('investir', 'Tous les investissements', 'investir'),
      entree('finances', 'Finances', 'finances'),
      entree('reglages', 'Réglages', 'reglages')),
    app.demo ? h('p.tres-discret', { style: { marginTop: '18px', textAlign: 'center' } }, 'Démonstration · Éclats fictifs') : null,
  );
}

function entree(route, nom, ic, aside) {
  return h('a.entree', { href: `#/${route}` }, icone(ic), h('span', nom), aside ? h('span.puce', aside) : null, icone('droite'));
}

function facade(e, cfg) {
  const annualisee = frequentationAnnualisee(cfg, e.historique);
  const suivant = cfg.statuts[e.statut + 1];
  return h('div.facade',
    h('h1', { style: { color: 'var(--creme)' } }, e.nom),
    h('div.plaque', cfg.statuts[e.statut].nom, h('small', `${grand(annualisee)} visiteurs par an`)),
    suivant ? h('div.prochain',
      jauge(annualisee / suivant.seuil),
      h('div.ligne.espace', h('span', suivant.nom), h('span', grand(suivant.seuil)))) : null);
}
