// Sécurité, salle par salle : le risque de tout le musée, chaque salle avec
// son matériel et ses agents, le matériel commun, les prêteurs, les œuvres
// volées. Menaces, salles et matériel ouvrent leur fiche détaillée.

import { h, icone, nombre, dateJour, ajouter } from '../dom.js';
import {
  MENACES, probabilites, risqueMaximal, seuilEmprunt, risqueMusee, lieuxSecurises, materielDe, affectation,
} from '../../moteur/securite.js';
import { ficheMenace, ficheMateriel, ficheSalle, ficheDossier, niveauRisque, resumeMateriel, risqueSalle } from '../fiches.js';
import { portrait } from '../composants.js';
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

  // Œuvres volées : un dossier chacune, la police et les détectives engagés.
  const volees = Object.values(e.oeuvres).filter((o) => o.lieu === 'volee');
  if (volees.length) {
    const carnet = e.detectives?.carnet || [];
    ajouter(vue, h('div.section', h('h2', 'Enquêtes')),
      h('div.entrees', volees.map((o) => {
        const restant = cfg.securite.enqueteSemaines - Math.floor((jour - o.voleeLe) / 7);
        const sur = carnet.filter((d) => d.mission?.oeuvre === o.id);
        const piste = (e.pistes || []).find((x) => x.oeuvre === o.id && x.expire > jour);
        return h('button.entree', { type: 'button', onclick: () => ficheDossier(app, o.id) },
          h('span', h('b', o.titre), h('small', { classe: piste ? 'alerte' : '' }, [
            piste ? `Piste à ${piste.ville}` : null,
            sur.length ? `${sur.length} détective${sur.length > 1 ? 's' : ''}` : 'Police seule',
            `${restant} semaines`,
          ].filter(Boolean).join(' · '))),
          sur.length ? h('span.equipe-portraits', sur.slice(0, 3).map((d) => portrait(d.nom))) : null,
          icone('droite'));
      })));
  }

  const histo = [...(e.securite?.historique || [])].reverse().slice(0, 12);
  if (histo.length) {
    const libelle = { vol: 'Vol', volSalle: 'Vol en salle', vandalisme: 'Vandalisme', retrouvee: 'Retrouvée', perdue: 'Perdue' };
    const par = (x) => (x.type === 'retrouvee' && x.par ? `par ${x.par}` : null);
    const lieux = new Map(lieuxSecurises(cfg, e).map((l) => [l.id, l.nom]));
    ajouter(vue, h('div.section', h('h2', 'Historique')),
      h('div.pile', { style: { gap: '4px' } }, histo.map((x) => h('div.ligne.espace',
        h('span', x.titre), h('span.tres-discret', [libelle[x.type] || x.type, par(x), lieux.get(x.lieu), dateJour(x.jour), x.heure !== undefined ? `${x.heure} h` : null].filter(Boolean).join(' · '))))));
  }
}
