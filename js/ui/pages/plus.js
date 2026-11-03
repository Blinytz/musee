// Menu Plus : les écrans secondaires.

import { h, icone, ajouter } from '../dom.js';
import { compter } from '../../moteur/batiment.js';
import { risqueMaximal } from '../../moteur/securite.js';
import { espacesOuverts } from '../../moteur/visiteurs.js';

export async function afficher(app, vue) {
  const e = app.jeu.etat;
  const cfg = app.jeu.cfg;
  const fermes = espacesOuverts(cfg, e, app.jeu.jour()).fermes.length;
  const candidats = (e.personnel?.candidats || []).length;
  const risque = risqueMaximal(cfg, e, app.jeu.jour());
  const entree = (route, nom, ic, aside) => h('a.carte.ligne', { href: `#/${route}`, style: { textDecoration: 'none', color: 'inherit' } },
    icone(ic), h('span', { style: { flex: 1 } }, nom), aside ? h('span.puce', aside) : null, icone('droite'));
  ajouter(vue, 
    app.installation ? h('button.bouton.primaire.plein.installer', { type: 'button', onclick: () => app.installer() }, 'Installer l\'application') : null,
    h('div.section', h('h2', 'Plus')),
    h('div.pile',
      entree('reserve', 'Réserve', 'reserve', `${compter(e, 'reserve')}/${e.batiment.reserve.places}`),
      entree('privee', 'Collection privée', 'privee', `${compter(e, 'privee')}/${e.batiment.privee.places}`),
      entree('personnel', 'Personnel', 'visiteurs', fermes ? `${fermes} salle${fermes > 1 ? 's' : ''} fermée${fermes > 1 ? 's' : ''}` : (candidats ? `${candidats} candidats` : null)),
      entree('securite', 'Sécurité', 'privee', `${(risque * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`),
      entree('investir', 'Investissements', 'investir'),
      entree('expositions', 'Expositions et prêts', 'expositions', e.prets.demande ? 'Demande' : (e.expositions.courante ? 'En cours' : null)),
      entree('rapport', 'Rapport', 'rapport'),
      entree('historique', 'Historique', 'historique'),
      entree('reglages', 'Réglages', 'reglages')),
    app.demo ? h('p.tres-discret', { style: { marginTop: '18px', textAlign: 'center' } }, 'Démonstration · Éclats fictifs') : null,
  );
}
