// Finances : le billet, ce que rapporte et coûte une heure de session au
// rythme d'aujourd'hui, les arriérés, et les campagnes de communication.

import { h, icone, nombre, dateJour, ajouter } from '../dom.js';
import { confirmer } from '../composants.js';
import { lignesFinances } from './session.js';
import { tauxHoraire, coutVisiteur, visiteursDuJour } from '../../moteur/visiteurs.js';
import { masseSalariale, effetsPersonnel } from '../../moteur/personnel.js';
import { chargesHoraires } from '../../moteur/charges.js';
import { bilanFinancier, prixOptimal } from '../../moteur/regles.js';
import { etatCampagne, coutCampagne } from '../../moteur/actions.js';

const decimale = (x) => x.toLocaleString('fr-FR', { maximumFractionDigits: x < 10 ? 1 : 0 });

export async function afficher(app, vue) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const jour = jeu.jour();
  const solde = app.solde;

  // L'heure de session type : l'œuvre en cours à l'atelier fixe les fournitures.
  const enCours = Object.values(e.oeuvres).filter((o) => o.lieu === 'atelier' && o.progression < 1).sort((a, b) => b.progression - a.progression)[0];
  const heure = bilanFinancier(cfg, {
    tauxHoraire: tauxHoraire(cfg, e, jour),
    salaireHoraire: masseSalariale(cfg, e),
    charges: chargesHoraires(cfg, e, jour, enCours?.niveau ?? 0),
    minutes: 60,
    abattement: effetsPersonnel(cfg, e).abattement || 0,
  });
  const optimal = Math.max(1, Math.round(prixOptimal(cfg, e.reputation) + coutVisiteur(cfg, e)));
  const arrieres = e.personnel?.arrieres || 0;

  ajouter(vue,
    h('div.section', h('h2', 'Finances'), solde !== null ? h('span.aside', `${nombre(solde)} ✦`) : null),
    h('div.carte.pile', { style: { gap: '10px' } },
      h('div.ligne.espace',
        h('div', h('div.fiche-legende', 'Billet'), h('div.tres-discret', `${nombre(visiteursDuJour(cfg, e, jour))} visiteurs par jour`)),
        h('div.billet',
          h('button.bouton.petit.icone-seule', { type: 'button', 'aria-label': 'Baisser le prix', disabled: e.prixBillet <= 0, onclick: () => app.agir('fixerPrix', e.prixBillet - 1) }, icone('retirer')),
          h('b', { style: { minWidth: '64px', textAlign: 'center' } }, e.prixBillet === 0 ? 'Gratuit' : `${e.prixBillet} ✦`),
          h('button.bouton.petit.icone-seule', { type: 'button', 'aria-label': 'Augmenter le prix', disabled: e.prixBillet >= cfg.visiteurs.prix.max, onclick: () => app.agir('fixerPrix', e.prixBillet + 1) }, icone('ajouter')))),
      h('div.ligne.espace.tres-discret', h('span', `Coût d'un visiteur ${decimale(coutVisiteur(cfg, e))} ✦`), h('span', `Optimal ${optimal} ✦`))),

    h('div.section', h('h2', 'Une heure de session')),
    h('div.carte.pile', { style: { gap: '6px' } }, lignesFinances(heure)),

    arrieres > 0 ? h('div.carte.ligne.espace', { style: { marginTop: '10px', color: 'var(--rouge)' } },
      h('b', 'Arriérés'), h('b', `${nombre(arrieres)} ✦`)) : null,
  );

  // Communication : une campagne à la fois, délai entre deux.
  const ec = etatCampagne(cfg, e, jour);
  ajouter(vue, h('div.section', h('h2', 'Communication')),
    h('div.pile', cfg.campagnes.map((c) => {
      const cout = coutCampagne(cfg, e, c.id, jour);
      let refus = null;
      if (c.statutMin && e.statut < c.statutMin) refus = cfg.statuts[c.statutMin].nom;
      else if (ec.active) refus = ec.active.id === c.id ? `Jusqu'au ${dateJour(ec.active.fin)}` : 'Campagne en cours';
      else if (ec.disponibleLe) refus = `Dès le ${dateJour(ec.disponibleLe)}`;
      return h('div.carte.ligne.espace',
        h('div', h('b', c.nom), h('div.tres-discret', `Visiteurs ×${c.multiplicateur.toLocaleString('fr-FR')} pendant ${c.jours} jours`)),
        h('button.bouton.petit.or', {
          type: 'button', disabled: !!refus || (solde !== null && solde < cout),
          onclick: async () => {
            if (!(await confirmer(c.nom, { texte: `${nombre(cout)} ✦`, oui: 'Lancer' }))) return;
            await app.agir('lancerCampagne', { id: c.id }, { succes: c.nom });
          },
        }, refus || `${nombre(cout)} ✦`));
    })),
    h('a.entree', {
      href: '#/historique', style: { marginTop: '14px', borderRadius: '20px', background: 'var(--carte)', boxShadow: 'var(--ombre-carte)' },
      onclick: () => { try { sessionStorage.setItem('musee_historique', 'eclats'); } catch { /* navigation privée */ } },
    }, icone('finances'), h('span', 'Mouvements d\'Éclats'), icone('droite')));
}
