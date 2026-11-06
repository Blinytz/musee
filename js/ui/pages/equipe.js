// Équipe : le personnel en badges, service par service, les candidats et
// les métiers. Côté sécurité : les enquêtes, le matériel commun et les
// derniers incidents. Un badge ouvre la fiche détaillée de la personne ;
// l'affectation aux salles se fait aussi en glissant les badges sur le plan.

import { h, icone, nombre, dateJour, ajouter } from '../dom.js';
import { portrait } from '../composants.js';
import {
  avecNiveaux, salaireHoraire, fraisRecrutement, masseSalariale, refusRole, arrieresBloquants,
} from '../../moteur/personnel.js';
import { espacesOuverts } from '../../moteur/visiteurs.js';
import { lieuxSecurises, affectation } from '../../moteur/securite.js';
import { catalogueInvestissements } from '../../moteur/actions.js';
import { fichePersonne, ficheMetier, ficheMateriel, ficheDossier, resumePersonne, resumeMetier, resumeMateriel, profilCourt } from '../fiches.js';

const decimale = (x) => x.toLocaleString('fr-FR', { maximumFractionDigits: x < 10 ? 1 : 0 });

const SERVICES = [
  { id: 'securite', nom: 'Sécurité', couleur: '#1f3346', roles: (r) => r.famille === 'securite' },
  { id: 'atelier', nom: 'Atelier', couleur: '#5a3a1e', roles: (r) => r.id === 'assistant' },
  { id: 'public', nom: 'Public', couleur: '#3f4d3d', roles: (r) => ['mediateur', 'accueil', 'communication'].includes(r.id) },
  { id: 'direction', nom: 'Direction', couleur: '#5e1d22', roles: (r) => ['conservateur', 'regisseur', 'commissaire', 'comptable'].includes(r.id) },
];
const CLE = 'musee_equipe';

export async function afficher(app, vue, { route }) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const jour = jeu.jour();
  let service = route === 'securite' ? 'securite' : null;
  if (!service) { try { service = sessionStorage.getItem(CLE); } catch { /* navigation privée */ } }
  const sv = SERVICES.find((x) => x.id === service) || SERVICES[0];
  const dans = (id) => sv.roles(cfg.personnel.roles.find((r) => r.id === id) || {});
  const equipe = avecNiveaux(cfg, e);
  const ordre = (x) => cfg.personnel.roles.findIndex((r) => r.id === x.role);
  const roleNom = (id) => cfg.personnel.roles.find((r) => r.id === id)?.nom || id;
  const candidats = (e.personnel.candidats || []).filter((c) => c.expire > jour);
  const fermes = espacesOuverts(cfg, e, jour).fermes.length;
  const arrieres = e.personnel.arrieres || 0;

  ajouter(vue,
    h('div.section', h('h2', 'Équipe'), h('span.aside', `${decimale(masseSalariale(cfg, e))} ✦ / h`)),
    fermes || arrieres > 0 ? h('div.bandeau-alerte',
      icone('alerteBouclier'),
      h('span', h('b', fermes ? `${fermes} salle${fermes > 1 ? 's' : ''} sans gardien` : 'Arriérés'), arrieres > 0 ? h('small', `${nombre(arrieres)} ✦ de salaires en retard`) : null),
      fermes ? h('a.bouton.petit', { href: '#/plan', onclick: () => { try { sessionStorage.setItem('musee_plan_mode', 'equipe'); } catch { /* navigation privée */ } } }, 'Plan') : null) : null,
    h('div.services', SERVICES.map((x) => {
      const n = equipe.filter((m) => x.roles(cfg.personnel.roles.find((r) => r.id === m.role) || {})).length;
      return h('button.service', {
        type: 'button', classe: x.id === sv.id ? 'actif' : '',
        onclick: () => { try { sessionStorage.setItem(CLE, x.id); } catch { /* navigation privée */ } app.rafraichirVue(); },
      }, h('b', n), h('span', x.nom));
    })),
  );

  // Les badges du service.
  const membres = equipe.filter((m) => dans(m.role)).sort((a, b) => ordre(a) - ordre(b) || b.niveau - a.niveau);
  const aRecruter = candidats.filter((c) => dans(c.role));
  const noms = new Map(lieuxSecurises(cfg, e).map((l) => [l.id, /^s\d+$/.test(l.id) ? `S${l.id.slice(1)}` : l.nom.split(' ')[0]]));
  ajouter(vue, h('div.badges',
    membres.map((m) => h('button.badge', { type: 'button', style: { '--service': sv.couleur }, onclick: () => fichePersonne(app, m) },
      h('span.bandeau', h('i')),
      portrait(m.nom),
      h('b', m.nom),
      h('small', roleNom(m.role)),
      h('span.niveau-badge', `Niveau ${m.niveau}`),
      h('span.etiquettes',
        profilCourt(m).slice(0, 1).map((x) => h('span.puce', { classe: x.bon ? 'bon' : 'mauvais' }, x.texte)),
        affectation(m).map((l) => h('span.puce.salle', noms.get(l) || l))))),
    h('button.badge.recruter', { type: 'button', onclick: () => document.getElementById('candidats')?.scrollIntoView({ behavior: 'smooth' }) },
      h('span.rond', icone('recruter')),
      h('b', aRecruter.length ? `${aRecruter.length} candidat${aRecruter.length > 1 ? 's' : ''}` : 'Recruter'),
      h('small', aRecruter.length ? 'Jusqu\'à lundi' : 'Nouveaux lundi'))));

  // Candidats du service.
  const bloque = arrieresBloquants(cfg, e);
  ajouter(vue,
    h('div.section', { id: 'candidats' }, h('h2', 'Candidats')),
    aRecruter.length
      ? h('div.personnes', aRecruter.sort((a, b) => ordre(a) - ordre(b)).map((c) => {
        const frais = fraisRecrutement(cfg, e, c);
        return ligne(app, c, {
          sous: `${roleNom(c.role)} · niv. ${c.niveau} · ${decimale(salaireHoraire(cfg, e, c))} ✦/h`,
          effet: resumePersonne(app, c, { candidat: true }),
          droite: h('button.bouton.petit.or', {
            type: 'button', disabled: bloque || (app.solde !== null && app.solde < frais),
            onclick: (ev) => { ev.stopPropagation(); fichePersonne(app, c, { candidat: true }); },
          }, bloque ? 'Arriérés' : `${nombre(frais)} ✦`),
          ouvrir: () => fichePersonne(app, c, { candidat: true }),
        });
      }))
      : h('div.vide', 'Nouveaux candidats lundi'));

  if (sv.id === 'securite') securite(app, vue, e, cfg, jour);

  // Les métiers du service, ouverts ou non.
  ajouter(vue,
    h('div.section', h('h2', 'Métiers')),
    h('div.entrees', cfg.personnel.roles.filter((r) => sv.roles(r)).map((r) => {
      const refus = refusRole(cfg, e, r);
      const n = equipe.filter((x) => x.role === r.id).length;
      return h('button.entree', { type: 'button', onclick: () => ficheMetier(app, r) },
        h('span', h('b', r.nom), h('small', resumeMetier(r.id))),
        refus ? h('span.puce', refus) : (n ? h('span.puce', n) : null),
        icone('droite'));
    })));
}

/** Enquêtes, matériel commun et derniers incidents. */
function securite(app, vue, e, cfg, jour) {
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

  const materiel = catalogueInvestissements(cfg, e).filter((x) => x.categorie === 'securite');
  ajouter(vue, h('div.section', h('h2', 'Matériel commun')),
    h('div.entrees', materiel.map((x) => {
      const effet = x.refus && !x.acquis ? null : resumeMateriel(app, x);
      return h('button.entree', { type: 'button', onclick: () => ficheMateriel(app, x) },
        h('span', h('b', x.nom), effet ? h('small', { classe: x.acquis ? '' : 'effet' }, effet) : null),
        x.acquis ? h('span.puce', 'Acquis')
          : h('span.puce', { style: x.refus ? null : { background: 'var(--laiton)', color: 'var(--laiton-texte)' } }, x.refus || `${nombre(x.prix)} ✦`),
        icone('droite'));
    })));

  const histo = [...(e.securite?.historique || [])].reverse().slice(0, 8);
  if (histo.length) {
    const libelle = { vol: 'Vol', volSalle: 'Vol en salle', vandalisme: 'Vandalisme', retrouvee: 'Retrouvée', perdue: 'Perdue' };
    const lieux = new Map(lieuxSecurises(cfg, e).map((l) => [l.id, l.nom]));
    ajouter(vue, h('div.section', h('h2', 'Derniers incidents')),
      h('div.carte.pile', { style: { gap: '6px' } }, histo.map((x) => h('div.ligne.espace',
        h('span', x.titre),
        h('span.tres-discret', [libelle[x.type] || x.type, x.type === 'retrouvee' && x.par ? `par ${x.par}` : null, lieux.get(x.lieu), dateJour(x.jour)].filter(Boolean).join(' · '))))));
  }
}

/** Une ligne de personne : portrait, nom, métier, effet, et à droite un prix ou un bouton. */
function ligne(app, p, { sous, effet, droite, ouvrir }) {
  return h('div.personne', {
    role: 'button', tabindex: 0,
    onclick: ouvrir,
    onkeydown: (ev) => { if (ev.key === 'Enter') ouvrir(); },
  },
  portrait(p.nom),
  h('div.personne-texte',
    h('b', p.nom, profilCourt(p).map((m) => h('span.puce', { classe: m.bon ? 'bon' : 'mauvais' }, m.texte))),
    h('small', sous),
    effet ? h('small.effet', effet) : h('small.tres-discret', resumeMetier(p.role))),
  droite);
}
