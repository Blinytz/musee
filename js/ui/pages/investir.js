// Investissements : paiement unique, effet permanent ; campagnes renouvelables.

import { h, nombre, dateJour, ajouter, icone } from '../dom.js';
import { confirmer } from '../composants.js';
import { catalogueInvestissements, etatCampagne, coutCampagne } from '../../moteur/actions.js';
import { prixAgrandissement, espacesPublics } from '../../moteur/batiment.js';
import { heuresChantier } from '../../moteur/charges.js';
import { jauge } from '../composants.js';

const CATEGORIES = [
  ['batiment', 'Bâtiment'],
  ['espaces', 'Espaces'],
  ['equipements', 'Équipements'],
  ['atelier', 'Atelier'],
  ['documentation', 'Documentation'],
  ['personnel', 'Personnel'],
];

function effetsTexte(cfg, effets) {
  if (!effets) return null;
  const t = [];
  if (effets.revenus) t.push(`Revenus ×${effets.revenus.toLocaleString('fr-FR')}`);
  if (effets.satisfaction) t.push(`Satisfaction +${effets.satisfaction}`);
  if (effets.efficacite) t.push(`Efficacité +${Math.round(effets.efficacite * 100)} %`);
  if (effets.revele === 1) t.push('Mouvement et artiste révélés');
  if (effets.revele === 2) t.push('Titre révélé');
  if (effets.remise) t.push(`Arrivages -${Math.round(effets.remise * 100)} %`);
  if (effets.conservateur) t.push(`${cfg.arrivages.nombreConservateur} œuvres par arrivage`);
  if (effets.securite) t.push(effets.securite === 1 ? 'Chefs-d\'œuvre exposables' : 'Trésors exposables');
  return t.join(' · ');
}

export async function afficher(app, vue) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const jour = jeu.jour();
  const liste = catalogueInvestissements(cfg, e);
  const solde = app.solde;

  const ligne = ({ nom, prix, refus, acquis, effets, quoi, sous }) => h('div.carte.ligne.espace',
    h('div', { style: { minWidth: 0 } },
      h('b', nom),
      sous || effets ? h('div.tres-discret', sous || effetsTexte(cfg, effets)) : null),
    acquis
      ? h('span.puce', 'Acquis')
      : h('button.bouton.petit.or', {
        type: 'button',
        disabled: !!refus || prix === null || (solde !== null && solde < prix),
        title: refus || '',
        onclick: async () => {
          if (!(await confirmer(nom, { texte: `${nombre(prix)} ✦`, oui: 'Acheter' }))) return;
          await app.agir('investir', { quoi }, { succes: nom });
        },
      }, refus && !acquis ? refus : `${nombre(prix)} ✦`));

  ajouter(vue, h('div.section', h('h2', 'Investissements')),
    h('div.rangee-boutons',
      h('a.bouton', { href: '#/personnel' }, icone('visiteurs'), 'Personnel'),
      h('a.bouton', { href: '#/securite' }, icone('privee'), 'Sécurité')));

  // Chantiers en cours : ils avancent pendant les sessions, un à la fois.
  if ((e.chantiers || []).length) {
    ajouter(vue, h('h3', { style: { margin: '18px 2px 8px' } }, 'Chantiers'),
      h('div.pile', e.chantiers.map((c, i) => h('div.carte.pile', { style: { gap: '8px' } },
        h('div.ligne.espace', h('b', c.nom), h('span.tres-discret.nombre', `${nombre(Math.floor(c.fait))} / ${c.heures} h`)),
        jauge(c.fait / c.heures),
        i ? h('div.tres-discret', 'En attente') : null))));
  }
  // Heures de chantier d'un achat du bâtiment.
  const chantier = (id) => {
    const quoi = id === 'aile' ? 'aile' : id === 'salle' ? 'salle' : id.startsWith('agrandir:') ? 'agrandissement' : id.startsWith('espace:') ? 'espace' : null;
    const h0 = quoi ? heuresChantier(cfg, quoi) : 0;
    return h0 ? `${h0} h de chantier` : null;
  };
  for (const [id, nom] of CATEGORIES) {
    const items = liste.filter((x) => x.categorie === id);
    if (id === 'batiment') {
      for (const s of espacesPublics(e).filter((x) => x.type === 'salle' || x.type === 'cabinet')) {
        const p = prixAgrandissement(cfg, e, s.id);
        items.push({
          id: `agrandir:${s.id}`, nom: `Agrandir ${s.nom || cfg.espaces[s.type]?.nom}`, prix: p,
          refus: p === null ? 'Maximum' : null, sous: `${s.places} → ${Math.min(cfg.batiment.agrandissement.max, s.places + cfg.batiment.agrandissement.places)} places`,
        });
      }
    }
    ajouter(vue, h('h3', { style: { margin: '18px 2px 8px' } }, nom),
      h('div.pile', items.map((x) => ligne({
        ...x, quoi: x.id,
        sous: [x.sous || effetsTexte(cfg, x.effets), x.acquis ? null : chantier(x.id)].filter(Boolean).join(' · ') || null,
      }))));
  }

  // Communication : une campagne à la fois, délai entre deux.
  const ec = etatCampagne(cfg, e, jour);
  ajouter(vue, h('h3', { style: { margin: '18px 2px 8px' } }, 'Communication'),
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
    })));
}
