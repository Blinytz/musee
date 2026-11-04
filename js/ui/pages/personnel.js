// Personnel : l'équipe, les candidats de la semaine, les métiers. Chaque
// ligne dit en une phrase ce que la personne change ; un appui ouvre sa
// fiche détaillée.

import { h, icone, nombre, ajouter } from '../dom.js';
import { portrait } from '../composants.js';
import { avecNiveaux, salaireHoraire, fraisRecrutement, masseSalariale, refusRole, arrieresBloquants } from '../../moteur/personnel.js';
import { espacesOuverts } from '../../moteur/visiteurs.js';
import { fichePersonne, ficheMetier, resumePersonne, resumeMetier } from '../fiches.js';

const decimale = (x) => x.toLocaleString('fr-FR', { maximumFractionDigits: x < 10 ? 1 : 0 });

export async function afficher(app, vue) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const jour = jeu.jour();
  const equipe = avecNiveaux(cfg, e);
  const salles = espacesOuverts(cfg, e, jour);
  const arrieres = e.personnel.arrieres || 0;
  const ordre = (x) => cfg.personnel.roles.findIndex((r) => r.id === x.role);
  const roleNom = (id) => cfg.personnel.roles.find((r) => r.id === id)?.nom || id;

  ajouter(vue,
    h('div.section', h('h2', 'Personnel'), h('span.aside', `${decimale(masseSalariale(cfg, e))} ✦/h`)),
    h('div.chiffres',
      h('div.chiffre', h('span', icone('musee'), 'Salles ouvertes'), h('b', `${salles.ouverts.size}/${salles.aGarder}`),
        salles.fermes.length ? h('small', { style: { color: 'var(--rouge)' } }, `${salles.fermes.length} sans gardien`) : null),
      h('div.chiffre', h('span', icone('visiteurs'), 'Équipe'), h('b', nombre(equipe.length)),
        arrieres > 0 ? h('small', { style: { color: 'var(--rouge)' } }, `Arriérés ${nombre(arrieres)} ✦`) : h('small', `${decimale(masseSalariale(cfg, e))} ✦ par heure de session`))),

    h('div.section', h('h2', 'Équipe')),
    equipe.length
      ? h('div.personnes', [...equipe].sort((a, b) => ordre(a) - ordre(b) || b.niveau - a.niveau).map((m) => ligne(app, m, {
        sous: `${roleNom(m.role)} · niv. ${m.niveau}`,
        effet: resumePersonne(app, m),
        droite: h('span.tres-discret.nombre', `${decimale(salaireHoraire(cfg, e, m))} ✦/h`),
        ouvrir: () => fichePersonne(app, m),
      })))
      : h('div.vide', 'Personne'),
  );

  const candidats = [...e.personnel.candidats].filter((c) => c.expire > jour).sort((a, b) => ordre(a) - ordre(b));
  const bloque = arrieresBloquants(cfg, e);
  ajouter(vue,
    h('div.section', h('h2', 'Candidats')),
    candidats.length
      ? h('div.personnes', candidats.map((c) => {
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
      : h('div.vide', 'Nouveaux candidats lundi'),
  );

  // Tous les métiers, ouverts ou non : ce qu'ils font, ce qui manque.
  ajouter(vue,
    h('div.section', h('h2', 'Métiers')),
    h('div.entrees', cfg.personnel.roles.map((r) => {
      const refus = refusRole(cfg, e, r);
      const n = equipe.filter((x) => x.role === r.id).length;
      return h('button.entree', { type: 'button', onclick: () => ficheMetier(app, r) },
        h('span', h('b', r.nom), h('small', resumeMetier(r.id))),
        refus ? h('span.puce', refus) : (n ? h('span.puce', { style: { background: 'var(--accent-sombre)', color: 'var(--accent)' } }, n) : null),
        icone('droite'));
    })),
  );
}

/** Une ligne de personne : portrait, nom, métier, effet, et à droite un prix ou un bouton. */
function ligne(app, p, { sous, effet, droite, ouvrir }) {
  return h('div.personne', {
    role: 'button', tabindex: 0,
    onclick: ouvrir,
    onkeydown: (ev) => { if (ev.key === 'Enter') ouvrir(); },
  },
  portrait(p.nom),
  h('div.personne-texte', h('b', p.nom), h('small', sous),
    effet ? h('small.effet', effet) : h('small.tres-discret', resumeMetier(p.role))),
  droite);
}
