// Atelier : emplacements de restauration, lancement des sessions, maîtrise.

import { h, vider, icone, nombre, pourcent, duree, ajouter } from '../dom.js';
import { feuille, peindre, puceNiveau, jauge, tenter, vignette, cartel } from '../composants.js';
import { emplacementsAtelier } from '../../moteur/batiment.js';
import {
  niveau, niveauMaitrise, progressionMaitrise, bonusMaitrise, effets, travailRequis,
} from '../../moteur/regles.js';
import { figerSession, resultatSession } from '../../moteur/actions.js';
import { lignesFinances, ligneAssistant } from './session.js';
import { etape } from '../../rendu/restauration.js';
import { placerApresRestauration } from './session.js';

export async function afficher(app, vue) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const enAtelier = Object.values(e.oeuvres).filter((o) => o.lieu === 'atelier');
  const n = emplacementsAtelier(cfg, e);

  const emplacements = [];
  for (let i = 0; i < Math.max(n, enAtelier.length); i++) {
    const o = enAtelier[i];
    emplacements.push(o ? await carteOeuvre(app, e, cfg, o) : emplacementVide(app, e, cfg));
  }

  ajouter(vue, 
    h('div.section', h('h2', 'Atelier'), h('span.aside', `${enAtelier.length}/${n}`)),
    h('div.pile', emplacements),
    maitrises(e, cfg),
    h('div', { style: { marginTop: '14px' } },
      h('a.bouton.plein', { href: '#/historique' }, icone('historique'), 'Historique des sessions')),
  );
}

async function carteOeuvre(app, e, cfg, o) {
  const fiche = await app.fiche(o.id);
  const toile = h('div.oeuvre-toile', { style: { minHeight: '180px' } });
  peindre(app, toile, { fiche, oeuvre: o, progression: o.progression, id: o.id, support: o.support, cote: 700 });
  const et = etape(cfg.rendu, o.progression);
  const requise = niveau(cfg, o.niveau).maitrise;
  const actuelle = niveauMaitrise(cfg, e.maitrise[o.support] || 0);
  const resteMin = travailRequis(cfg, o.niveau) * (1 - o.progression);
  const fini = o.progression >= 1;
  const c = cartel(app, o, fiche);

  return h('div.carte.pile',
    h('button', { type: 'button', style: { all: 'unset', cursor: 'pointer' }, onclick: () => app.naviguer(`oeuvre/${o.id}`) }, toile),
    h('div.ligne.espace',
      h('div', { style: { minWidth: 0 } },
        h('h3', c.titre),
        h('div.tres-discret', [c.artiste, c.connu ? c.support : null].filter(Boolean).join(' · '))),
      puceNiveau(cfg, o.niveau)),
    h('div.ligne.espace', h('span', fini ? 'Restaurée' : et.nom), h('b.nombre', pourcent(o.progression))),
    jauge(o.progression),
    fini
      ? h('div.rangee-boutons', placerApresRestauration(app, o.id))
      : h('div.pile',
        actuelle < requise ? h('div.tres-discret', { style: { color: 'var(--rouge)' } }, `Maîtrise ${requise} requise · actuelle ${actuelle}`) : null,
        h('div.tres-discret', `Reste ${duree(resteMin)} de travail`),
        h('div.rangee-boutons',
          h('button.bouton', { type: 'button', onclick: () => app.agir('deplacer', { oeuvre: o.id, vers: { lieu: 'reserve' } }) }, 'Réserve'),
          h('button.bouton.primaire', {
            type: 'button', disabled: actuelle < requise || !!e.session,
            onclick: () => choisirDuree(app, o),
          }, icone('lancer'), 'Session'))));
}

function emplacementVide(app, e, cfg) {
  return h('button.carte', {
    type: 'button',
    style: { minHeight: '120px', display: 'grid', placeItems: 'center', borderStyle: 'dashed', width: '100%' },
    onclick: () => choisirOeuvre(app, e, cfg),
  }, h('span.discret', icone('ajouter'), ' Placer une œuvre'));
}

async function choisirOeuvre(app, e, cfg) {
  const candidates = Object.values(e.oeuvres).filter((o) => o.lieu === 'reserve' && o.progression < 1)
    .sort((a, b) => b.progression - a.progression || b.niveau - a.niveau);
  const fiches = await app.catalogue.fiches(candidates.map((o) => o.id));
  const f = feuille({
    titre: 'Réserve',
    contenu: candidates.length ? h('div.grille', candidates.map((o, i) => {
      const requise = niveau(cfg, o.niveau).maitrise;
      const actuelle = niveauMaitrise(cfg, e.maitrise[o.support] || 0);
      return vignette(app, {
        id: o.id, fiche: fiches[i], oeuvre: o,
        sous: actuelle < requise ? `Maîtrise ${requise} requise` : (cartel(app, o, fiches[i]).artiste || ''),
        onclick: async () => {
          f.fermer();
          await app.agir('deplacer', { oeuvre: o.id, vers: { lieu: 'atelier' } });
        },
      });
    })) : h('div.vide', h('a', { href: '#/arrivages', onclick: () => f.fermer() }, 'Aucune œuvre à restaurer · Arrivages')),
  });
}

/** Choix de la durée : de 10 min à 7 h, à la minute près. */
function choisirDuree(app, o) {
  const { jeu } = app;
  const cfg = jeu.cfg;
  const e = jeu.etat;
  const s = cfg.session;
  let minutes = Math.min(s.dureeMaxMin, Math.max(s.dureeMinMin, e.reglages.dureeSession || s.dureeDefautMin));
  // L'aperçu rejoue exactement la fin de session : mêmes moteurs, même
  // figement des recettes, des salaires et du travail des assistants.
  const figes = figerSession(cfg, e, o.id, jeu.jour());
  const requis = travailRequis(cfg, o.niveau);

  const valeur = h('div.compte', { style: { fontSize: '44px' } });
  const details = h('div.pile', { style: { gap: '6px' } });
  const curseur = h('input', {
    type: 'range', min: s.dureeMinMin, max: s.dureeMaxMin, step: 1, value: minutes,
    style: { width: '100%', accentColor: 'var(--accent)' },
    oninput: () => { minutes = Number(curseur.value); maj(); },
  });
  const pas = (d) => h('button.bouton.petit', { type: 'button', onclick: () => { minutes = Math.min(s.dureeMaxMin, Math.max(s.dureeMinMin, minutes + d)); curseur.value = minutes; maj(); } }, d > 0 ? `+${d}` : `${d}`);
  const raccourcis = [25, 60, 120, 180, 240, 420].map((m) => h('button.bouton.petit', {
    type: 'button', onclick: () => { minutes = m; curseur.value = m; maj(); },
  }, duree(m)));

  function maj() {
    valeur.textContent = duree(minutes);
    const r = resultatSession(cfg, { debut: 0, dureeMin: minutes, figes }, minutes * 60e3, { arrieres: e.personnel?.arrieres || 0 });
    vider(details,
      h('div.ligne.espace', h('span.discret', 'Restauration'), h('b.nombre', `${pourcent(r.progressionAvant)} → ${pourcent(r.progressionApres)}`)),
      r.assistants.map((a) => ligneAssistant(app, a)),
      lignesFinances(r.finances),
      r.perdu > 0.5 ? h('div.ligne.espace', h('span.discret', 'Surplus perdu'), h('span', { style: { color: 'var(--rouge)' } }, duree(r.perdu))) : null,
    );
  }
  maj();

  const f = feuille({
    titre: cartel(app, o, null).titre,
    contenu: h('div.pile',
      valeur,
      h('div.ligne', pas(-10), pas(-1), curseur, pas(1), pas(10)),
      h('div.rangee-boutons', raccourcis),
      details),
    actions: h('button.bouton.primaire.plein', {
      type: 'button', style: { marginTop: '14px' },
      onclick: async (ev) => {
        ev.currentTarget.disabled = true;
        const ok = await tenter(() => jeu.demarrerSession(o.id, minutes));
        if (ok) {
          f.fermer();
          jeu.executer('reglages', { dureeSession: minutes }).catch(() => {});
        } else ev.currentTarget.disabled = false;
      },
    }, icone('lancer'), 'Lancer'),
  });
}

function maitrises(e, cfg) {
  const eff = effets(cfg, e).efficacite;
  return h('div',
    h('div.section', h('h2', 'Maîtrise'), eff ? h('span.aside', `Équipement +${Math.round(eff * 100)} %`) : null),
    h('div.pile', cfg.supports.map((s) => {
      const p = progressionMaitrise(cfg, e.maitrise[s.id] || 0);
      return h('div.carte',
        h('div.ligne.espace',
          h('b', s.nom),
          h('span.discret', `Niveau ${p.niveau} · +${Math.round(bonusMaitrise(cfg, e.maitrise[s.id] || 0) * 100)} %`)),
        h('div', { style: { margin: '8px 0 4px' } }, jauge(p.part, 'or')),
        h('div.tres-discret', p.prochain ? `${p.heures.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h / ${p.prochain} h` : `${Math.round(p.heures)} h`));
    })));
}
