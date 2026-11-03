// Classement mondial : rang, voisins, écart à combler.

import { h, vider, nombre, grand, ajouter, majuscule } from '../dom.js';
import { tableau } from '../../moteur/classement.js';
import { frequentationAnnualisee } from '../../moteur/regles.js';

export async function afficher(app, vue) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const musees = jeu.musees;
  let critere = sessionStorage.getItem('musee_classement') || 'annualisee';
  let tout = false;
  const corps = h('div');
  const onglets = h('div.onglets');

  function dessiner() {
    try { sessionStorage.setItem('musee_classement', critere); } catch { /* navigation privée */ }
    vider(onglets, ...[['annualisee', 'Fréquentation'], ['prestige', 'Prestige']].map(([id, nom]) => h('button', {
      type: 'button', classe: critere === id ? 'actif' : '', onclick: () => { critere = id; dessiner(); },
    }, nom)));
    if (!musees.length) { vider(corps, h('div.vide', 'Classement indisponible')); return; }
    const annualisee = e.classement?.annualisee ?? frequentationAnnualisee(cfg, e.historique);
    const lignes = tableau(cfg, e, musees, annualisee, critere);
    const i = lignes.findIndex((l) => l.joueur);
    const moi = lignes[i];
    const devant = lignes[i - 1];
    const v = cfg.classement.voisins;
    const visibles = tout ? lignes : lignes.slice(Math.max(0, i - v), i + v + 1);
    const valeur = (l) => (critere === 'prestige' ? `${nombre(l.prestige)} ★` : grand(l.annualisee));
    const evolution = critere === 'annualisee' && e.classement?.precedent ? e.classement.precedent - e.classement.rang : 0;

    vider(corps, 
      h('div.facade', { style: { textAlign: 'center' } },
        h('div.statut-nom', { style: { fontSize: '54px' } }, `${moi.rang}`),
        h('div.discret', `sur ${nombre(lignes.length)}`),
        evolution ? h('div', { classe: evolution > 0 ? 'hausse' : 'baisse' }, `${evolution > 0 ? '+' : ''}${evolution} hier`) : null,
        devant ? h('div.tres-discret', { style: { marginTop: '8px' } },
          `${majuscule(devant.nom)} · ${critere === 'prestige' ? `${nombre(devant.prestige - moi.prestige + 1)} ★` : `${grand(devant.annualisee - moi.annualisee + 1)} visiteurs/an`} à combler`) : null),
      h('div.pile', { style: { gap: '2px', marginTop: '12px' } }, visibles.map((l) => h('div.classement-ligne', { classe: l.joueur ? 'joueur' : '' },
        h('span.rang', `${l.rang}`),
        h('span.nom', majuscule(l.nom), l.ville || l.pays ? h('span.tres-discret', ` · ${majuscule(l.ville || l.pays)}`) : null),
        h('span.nombre', valeur(l))))),
      h('button.bouton.plein', { type: 'button', style: { marginTop: '12px' }, onclick: () => { tout = !tout; dessiner(); } }, tout ? 'Voisins' : 'Tout le classement'),
    );
  }

  ajouter(vue, h('div.section', h('h2', 'Classement')), onglets, h('div', { style: { marginTop: '12px' } }, corps));
  dessiner();
}
