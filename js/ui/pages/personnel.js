// Personnel : l'équipe, les candidats de la semaine, les salles ouvertes.

import { h, icone, nombre, ajouter } from '../dom.js';
import { confirmer, jauge, portrait } from '../composants.js';
import {
  avecNiveaux, salaireHoraire, effetTexte, fraisRecrutement, masseSalariale, role, rolesOuverts, minutesPourNiveau, refusRole, arrieresBloquants,
} from '../../moteur/personnel.js';
import { espacesOuverts } from '../../moteur/visiteurs.js';

const nombreSalaire = (x) => x.toLocaleString('fr-FR', { maximumFractionDigits: x < 10 ? 1 : 0 });

export async function afficher(app, vue) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const jour = jeu.jour();
  const equipe = avecNiveaux(cfg, e);
  const salles = espacesOuverts(cfg, e, jour);
  const arrieres = e.personnel.arrieres || 0;

  ajouter(vue,
    h('div.section', h('h2', 'Personnel'), h('span.aside', `${nombreSalaire(masseSalariale(cfg, e))} ✦/h`)),
    h('div.chiffres',
      h('div.chiffre', h('span', icone('musee'), 'Salles ouvertes'), h('b', `${salles.ouverts.size}/${salles.aGarder}`),
        salles.fermes.length ? h('small', { style: { color: 'var(--rouge)' } }, `${salles.fermes.length} sans gardien`) : null),
      h('div.chiffre', h('span', icone('visiteurs'), 'Équipe'), h('b', nombre(equipe.length)),
        arrieres > 0 ? h('small', { style: { color: 'var(--rouge)' } }, `Arriérés ${nombre(arrieres)} ✦`) : h('small', `${nombreSalaire(masseSalariale(cfg, e))} ✦ par heure de session`))),
  );

  // L'équipe, métier par métier, dans l'ordre de la configuration.
  for (const r of cfg.personnel.roles) {
    const membres = equipe.filter((x) => x.role === r.id);
    if (!membres.length) continue;
    ajouter(vue, h('h3', { style: { margin: '18px 2px 8px' } }, r.pluriel),
      h('div.pile', membres.map((m) => carteEmploye(app, cfg, e, m))));
  }

  // Les candidats de la semaine.
  const candidats = [...e.personnel.candidats].filter((c) => c.expire > jour)
    .sort((a, b) => cfg.personnel.roles.findIndex((r) => r.id === a.role) - cfg.personnel.roles.findIndex((r) => r.id === b.role));
  ajouter(vue, h('div.section', h('h2', 'Candidats'), null),
    candidats.length
      ? h('div.pile', candidats.map((c) => carteCandidat(app, cfg, e, c, arrieresBloquants(cfg, e))))
      : h('div.vide', 'Nouveaux candidats lundi'));

  const fermes = cfg.personnel.roles.filter((r) => !rolesOuverts(cfg, e).includes(r));
  if (fermes.length) {
    ajouter(vue, h('div.pile', { style: { marginTop: '14px', gap: '4px' } },
      fermes.map((r) => h('div.ligne.espace.tres-discret', h('span', r.nom), h('span', refusRole(cfg, e, r))))));
  }
}

function carteEmploye(app, cfg, e, m) {
  const prochain = m.niveau < cfg.personnel.niveauMax ? minutesPourNiveau(cfg, m.niveau + 1) : null;
  const bas = minutesPourNiveau(cfg, m.niveau);
  return h('div.carte.fiche-employe', portrait(m.nom), h('div.pile',
    h('div.ligne.espace',
      h('div', { style: { minWidth: 0 } }, h('b', m.nom), h('div.tres-discret', effetTexte(cfg, m))),
      h('span.puce', `Niv. ${m.niveau}`)),
    prochain !== null ? jauge((m.minutes - bas) / (prochain - bas), 'or') : null,
    h('div.ligne.espace.tres-discret',
      h('span', `${Math.floor(m.minutes / 60)} h travaillées`),
      h('span', `${nombreSalaire(salaireHoraire(cfg, e, m))} ✦/h`)),
    h('button.bouton.petit.danger', {
      type: 'button', style: { justifySelf: 'start' },
      onclick: async () => {
        if (!(await confirmer(`Licencier ${m.nom} ?`, { oui: 'Licencier', danger: true }))) return;
        await app.agir('licencier', { employe: m.id });
      },
    }, 'Licencier')));
}

function carteCandidat(app, cfg, e, c, bloque) {
  const frais = fraisRecrutement(cfg, e, c);
  const r = role(cfg, c.role);
  const trop = app.solde !== null && app.solde < frais;
  return h('div.carte.fiche-employe', portrait(c.nom), h('div.pile',
    h('div.ligne.espace',
      h('div', { style: { minWidth: 0 } }, h('b', c.nom), h('div.discret', r?.nom)),
      h('span.puce', `Niv. ${c.niveau}`)),
    h('div.tres-discret', effetTexte(cfg, c)),
    h('div.ligne.espace',
      h('span.tres-discret', `${nombreSalaire(salaireHoraire(cfg, e, c))} ✦/h`),
      h('button.bouton.petit.or', {
        type: 'button', disabled: bloque || trop,
        onclick: async () => {
          if (!(await confirmer(`Embaucher ${c.nom} ?`, { texte: `${r?.nom} · ${nombre(frais)} ✦`, oui: 'Embaucher' }))) return;
          await app.agir('embaucher', { candidat: c.id }, { succes: `${c.nom} rejoint l'équipe` });
        },
      }, bloque ? 'Arriérés' : `Embaucher · ${nombre(frais)} ✦`))));
}
