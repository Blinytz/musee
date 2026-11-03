// Sécurité : trois menaces, le matériel, l'équipe, les prêteurs, les œuvres volées.

import { h, icone, nombre, dateJour, ajouter, pourcent } from '../dom.js';
import { confirmer, jauge } from '../composants.js';
import {
  MENACES, risques, protections, probabilites, risqueMaximal, chanceEnquete, seuilEmprunt,
} from '../../moteur/securite.js';
import { catalogueInvestissements } from '../../moteur/actions.js';
import { employes, role } from '../../moteur/personnel.js';
import { prochainJourSemaine } from '../../moteur/temps.js';

const pct = (p) => `${(p * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;

export async function afficher(app, vue) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const jour = jeu.jour();
  const r = risques(cfg, e, jour);
  const s = protections(cfg, e);
  const p = probabilites(cfg, e, jour);
  const tirage = prochainJourSemaine(jour, cfg.securite.jourSemaine);

  ajouter(vue,
    h('div.section', h('h2', 'Sécurité'), h('span.aside', `Tirage le ${dateJour(tirage, { weekday: 'long' })}`)),
    h('div.pile', MENACES.map((m) => h('div.carte.pile', { style: { gap: '6px' } },
      h('div.ligne.espace',
        h('b', cfg.securite.menaces[m].nom),
        h('b.nombre', { style: { color: p[m] > 0.05 ? 'var(--rouge)' : p[m] < 0.015 ? 'var(--vert)' : null } }, `${pct(p[m])} / sem.`)),
      jauge(r[m] ? Math.min(1, s[m] / r[m]) : 1),
      h('div.ligne.espace.tres-discret', h('span', `Protection ${nombre(s[m])}`), h('span', `Risque ${nombre(r[m])}`))))),
  );

  // Ce que les prêteurs exigent avant de confier une œuvre.
  const pire = risqueMaximal(cfg, e, jour);
  const seuils = Object.keys(cfg.securite.seuilsEmprunt || {}).map(Number).sort();
  if (seuils.length) {
    ajouter(vue, h('h3', { style: { margin: '18px 2px 8px' } }, 'Prêteurs'),
      h('div.carte.pile', { style: { gap: '6px' } }, seuils.map((n) => {
        const ok = pire <= seuilEmprunt(cfg, n);
        return h('div.ligne.espace',
          h('span', cfg.niveaux[n].pluriel),
          h('span', { style: { color: ok ? 'var(--vert)' : 'var(--texte-3)' } }, ok ? icone('valider') : `${pct(seuilEmprunt(cfg, n))} max`));
      })));
  }

  // Matériel, avec ce qu'il couvre et le métier qu'il ouvre.
  const solde = app.solde;
  const ouvre = (id) => cfg.personnel.roles.find((x) => x.equipement === id);
  const materiel = catalogueInvestissements(cfg, e).filter((x) => x.categorie === 'securite');
  ajouter(vue, h('h3', { style: { margin: '18px 2px 8px' } }, 'Matériel'),
    h('div.pile', materiel.map((x) => {
      const f = x.effets || {};
      const couvre = MENACES.filter((m) => f[m]).map((m) => `${cfg.securite.menaces[m].nom.toLowerCase()} +${nombre(f[m])}`);
      const metier = ouvre(x.id.replace(/^inv:/, ''));
      const sansServant = f.requiert && !employes(e, f.requiert).length && x.acquis;
      return h('div.carte.ligne.espace',
        h('div', { style: { minWidth: 0 } },
          h('b', x.nom),
          h('div.tres-discret', [
            couvre.join(' · '),
            f.salleForte ? 'réserve protégée' : null,
            f.securite === 1 ? 'Chefs-d\'œuvre exposables' : null,
            f.securite === 2 ? 'Trésors exposables' : null,
          ].filter(Boolean).join(' · ') || null),
          metier ? h('div.tres-discret', { style: { color: 'var(--accent)' } }, metier.nom) : null,
          sansServant ? h('div.tres-discret', { style: { color: 'var(--rouge)' } }, `Sans ${role(cfg, f.requiert)?.nom.toLowerCase()}`) : null),
        x.acquis ? h('span.puce', 'Acquis') : h('button.bouton.petit.or', {
          type: 'button', disabled: !!x.refus || (solde !== null && solde < x.prix),
          onclick: async () => {
            if (!(await confirmer(x.nom, { texte: `${nombre(x.prix)} ✦`, oui: 'Acheter' }))) return;
            await app.agir('investir', { quoi: x.id }, { succes: x.nom });
          },
        }, x.refus || `${nombre(x.prix)} ✦`));
    })));

  // L'équipe de sécurité, métier par métier.
  const securite = cfg.personnel.roles.filter((x) => x.famille === 'securite');
  ajouter(vue, h('a.carte.pile', { href: '#/personnel', style: { textDecoration: 'none', color: 'inherit', marginTop: '10px', gap: '4px' } },
    h('div.ligne.espace', h('b', 'Équipe'), icone('droite')),
    securite.map((x) => {
      const n = employes(e, x.id).length;
      return n ? h('div.ligne.espace.tres-discret', h('span', x.pluriel), h('span', n)) : null;
    })));

  // Œuvres volées : l'enquête continue chaque semaine.
  const volees = Object.values(e.oeuvres).filter((o) => o.lieu === 'volee');
  if (volees.length) {
    const chance = chanceEnquete(cfg, e);
    ajouter(vue, h('div.section', h('h2', 'Œuvres volées')),
      h('div.pile', volees.map((o) => {
        const restant = cfg.securite.enqueteSemaines - Math.floor((jour - o.voleeLe) / 7);
        return h('a.carte.ligne.espace', { href: `#/oeuvre/${o.id}`, style: { textDecoration: 'none', color: 'inherit' } },
          h('div', h('b', o.titre), h('div.tres-discret', `Volée le ${dateJour(o.voleeLe)}`)),
          h('div', { style: { textAlign: 'right' } }, h('div', `${pourcent(chance)} par semaine`), h('div.tres-discret', `${restant} semaines`)));
      })));
  }

  const histo = [...(e.securite?.historique || [])].reverse().slice(0, 12);
  if (histo.length) {
    const libelle = { vol: 'Cambriolage', volSalle: 'Vol en salle', vandalisme: 'Vandalisme', retrouvee: 'Retrouvée', perdue: 'Perdue' };
    ajouter(vue, h('div.section', h('h2', 'Historique')),
      h('div.pile', { style: { gap: '4px' } }, histo.map((x) => h('div.ligne.espace',
        h('span', x.titre), h('span.tres-discret', `${libelle[x.type] || x.type} · ${dateJour(x.jour)}`)))));
  }
}
