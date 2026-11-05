// Sécurité, salle par salle : le risque de tout le musée, chaque salle avec
// son matériel et ses agents, le matériel commun, les prêteurs, les œuvres
// volées. Menaces, salles et matériel ouvrent leur fiche détaillée.

import { h, icone, nombre, dateJour, ajouter, pourcent } from '../dom.js';
import {
  MENACES, probabilites, risqueMaximal, chanceEnquete, seuilEmprunt, risqueMusee, lieuxSecurises, materielDe, affectation,
} from '../../moteur/securite.js';
import { ficheMenace, ficheMateriel, ficheSalle, niveauRisque, resumeMateriel, risqueSalle } from '../fiches.js';
import { catalogueInvestissements } from '../../moteur/actions.js';
import { employes, role } from '../../moteur/personnel.js';

const pct = (p) => `${(p * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;

export async function afficher(app, vue) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const jour = jeu.jour();
  const p = risqueMusee(cfg, e, jour);
  const p7 = probabilites(cfg, e, jour);
  // La jauge se remplit avec le risque : pleine à 10 % par semaine.
  const plein = 0.10;
  const agents = employes(e).filter((x) => role(cfg, x.role)?.menaces);

  ajouter(vue,
    h('div.section', h('h2', 'Sécurité'), h('span.aside', 'Par semaine, tout le musée')),
    h('div.menaces.deux', MENACES.map((m) => {
      const n = niveauRisque(p[m]);
      return h('button.menace', { type: 'button', onclick: () => ficheMenace(app, m) },
        h('b', cfg.securite.menaces[m].nom),
        h('span.menace-valeur', { style: { color: n.couleur } }, pct(p[m])),
        h('div.jauge', h('i', { style: { width: `${Math.min(1, p[m] / plein) * 100}%`, background: n.couleur } })),
        h('small', n.mot));
    })),
  );

  // Chaque espace : son risque, son matériel, ses agents.
  ajouter(vue, h('div.section', h('h2', 'Salles')),
    h('div.entrees', lieuxSecurises(cfg, e).map((l) => {
      const q = risqueSalle(p7, l.id);
      const n = niveauRisque(q);
      const nbAgents = agents.filter((x) => affectation(x).includes(l.id)).length;
      const nbMateriel = materielDe(e, l.id).length;
      return h('button.entree', { type: 'button', onclick: () => ficheSalle(app, l.id) },
        h('span', h('b', l.nom), h('small', [
          nbMateriel ? `${nbMateriel} matériel${nbMateriel > 1 ? 's' : ''}` : 'Aucun matériel',
          nbAgents ? `${nbAgents} agent${nbAgents > 1 ? 's' : ''}` : 'aucun agent',
        ].join(' · '))),
        q > 0 ? h('span.puce', { style: { color: n.couleur } }, pct(q)) : h('span.puce', 'Vide'),
        icone('droite'));
    })));

  // Ce que les prêteurs exigent avant de confier une œuvre.
  const pire = risqueMaximal(cfg, e, jour);
  const seuils = Object.keys(cfg.securite.seuilsEmprunt || {}).map(Number).sort();
  if (seuils.length) {
    ajouter(vue, h('div.section', h('h2', 'Prêteurs')),
      h('div.carte.pile', { style: { gap: '6px' } }, seuils.map((n) => {
        const ok = pire <= seuilEmprunt(cfg, n);
        return h('div.ligne.espace',
          h('span', cfg.niveaux[n].pluriel),
          h('span', { style: { color: ok ? 'var(--vert)' : 'var(--texte-3)' } }, ok ? icone('valider') : `${pct(seuilEmprunt(cfg, n))} max`));
      })));
  }

  // Matériel, avec ce qu'il couvre et le métier qu'il ouvre.
  const ouvre = (id) => cfg.personnel.roles.find((x) => x.equipement === id);
  const materiel = catalogueInvestissements(cfg, e).filter((x) => x.categorie === 'securite');
  ajouter(vue, h('div.section', h('h2', 'Matériel commun')),
    h('div.entrees', materiel.map((x) => {
      const f = x.effets || {};
      const metier = ouvre(x.id.replace(/^inv:/, ''));
      const sansServant = f.requiert && !employes(e, f.requiert).length && x.acquis;
      const effet = x.refus && !x.acquis ? null : resumeMateriel(app, x);
      const norme = f.securite ? `${f.securite === 1 ? 'Chefs-d\'œuvre' : 'Trésors'} exposables` : null;
      const sous = sansServant ? `Sans ${role(cfg, f.requiert)?.nom.toLowerCase()}`
        : (effet || (metier ? `Ouvre : ${metier.nom.toLowerCase()}` : norme));
      return h('button.entree', { type: 'button', onclick: () => ficheMateriel(app, x) },
        h('span', h('b', x.nom), sous ? h('small', { classe: sansServant ? 'alerte' : (effet && !x.acquis ? 'effet' : '') }, sous) : null),
        x.acquis ? h('span.puce', 'Acquis')
          : h('span.puce', { style: x.refus ? null : { background: 'var(--laiton)', color: 'var(--laiton-texte)' } }, x.refus || `${nombre(x.prix)} ✦`),
        icone('droite'));
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
    const libelle = { vol: 'Vol', volSalle: 'Vol en salle', vandalisme: 'Vandalisme', retrouvee: 'Retrouvée', perdue: 'Perdue' };
    const lieux = new Map(lieuxSecurises(cfg, e).map((l) => [l.id, l.nom]));
    ajouter(vue, h('div.section', h('h2', 'Historique')),
      h('div.pile', { style: { gap: '4px' } }, histo.map((x) => h('div.ligne.espace',
        h('span', x.titre), h('span.tres-discret', [libelle[x.type] || x.type, lieux.get(x.lieu), dateJour(x.jour), x.heure !== undefined ? `${x.heure} h` : null].filter(Boolean).join(' · '))))));
  }
}
