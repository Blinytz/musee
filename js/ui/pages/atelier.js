// Atelier : emplacements de restauration, lancement des sessions, maîtrise.

import { h, vider, icone, nombre, pourcent, duree, ajouter } from '../dom.js';
import { feuille, puceNiveau, jauge, tenter, vignette, cartel, cadreOeuvre, couleurMur, portrait } from '../composants.js';
import { emplacementsAtelier } from '../../moteur/batiment.js';
import { restaurateursLibres } from '../../moteur/atelier.js';
import { employes } from '../../moteur/personnel.js';
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
    if (!o) emplacements.push(emplacementVide(app, e, cfg));
    else emplacements.push(o.travaux ? await carteTravaux(app, e, cfg, o) : await carteOeuvre(app, e, cfg, o));
  }
  const restaurateurs = employes(e, 'assistant');
  const libres = restaurateursLibres(cfg, e).length;

  ajouter(vue, 
    h('div.section', h('h2', 'Atelier'), h('span.aside', `${enAtelier.length}/${n} emplacements`)),
    h('a.carte.equipe', { href: '#/personnel', style: { textDecoration: 'none', color: 'inherit', marginBottom: '12px' } },
      restaurateurs.length
        ? h('div.equipe-portraits', restaurateurs.slice(0, 4).map((r) => portrait(r.nom)))
        : h('span.portrait', { style: { display: 'grid', placeItems: 'center', color: 'var(--accent)' } }, icone('atelier')),
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('b', 'Restaurateurs'),
        h('div.tres-discret', restaurateurs.length ? `${libres} libre${libres > 1 ? 's' : ''} sur ${restaurateurs.length}` : 'Aucun : réparations impossibles')),
      icone('droite')),
    h('div.pile', emplacements),
    maitrises(e, cfg),
    h('div', { style: { marginTop: '14px' } },
      h('a.bouton.plein', { href: '#/historique' }, icone('historique'), 'Historique des sessions')),
  );
}

/** Une réparation ou un ravivage en cours : l'œuvre, qui y travaille, quand elle ressort. */
async function carteTravaux(app, e, cfg, o) {
  const fiche = await app.fiche(o.id);
  const t = o.travaux;
  const reste = Math.max(0, t.fin - app.jeu.jour());
  const total = Math.max(1, t.fin - t.debut);
  return h('div.chevalet',
    h('button.chevalet-toile', { type: 'button', style: { '--mur': '#3a2f28', padding: '22px 20px 16px' }, onclick: () => app.naviguer(`oeuvre/${o.id}`) },
      cadreOeuvre(app, { id: o.id, fiche, oeuvre: o, hauteur: 110, largeurMax: 200, cote: 400 }),
      h('span.plaque', t.type === 'ravivage' ? 'Ravivage' : 'Réparation', h('small', reste ? `prête dans ${reste} j` : 'prête demain'))),
    h('div.chevalet-corps',
      h('div.ligne.espace', h('h3', cartel(app, o, fiche).titre), puceNiveau(cfg, o.niveau)),
      jauge(1 - reste / total),
      h('div.tres-discret', `${t.nom} s'en occupe`)));
}

async function carteOeuvre(app, e, cfg, o) {
  const fiche = await app.fiche(o.id);
  const largeurMax = Math.min(680, window.innerWidth || 390) - 100;
  const et = etape(cfg.rendu, o.progression);
  const requise = niveau(cfg, o.niveau).maitrise;
  const actuelle = niveauMaitrise(cfg, e.maitrise[o.support] || 0);
  const resteMin = travailRequis(cfg, o.niveau) * (1 - o.progression);
  const fini = o.progression >= 1;
  const c = cartel(app, o, fiche);

  return h('div.chevalet',
    h('button.chevalet-toile', { type: 'button', style: { '--mur': couleurMur(null, 0) }, onclick: () => app.naviguer(`oeuvre/${o.id}`) },
      cadreOeuvre(app, { id: o.id, fiche, oeuvre: o, progression: o.progression, hauteur: 220, largeurMax, cote: 700 }),
      h('span.plaque', fini ? 'Restaurée' : et.nom, h('small', pourcent(o.progression)))),
    h('div.chevalet-corps',
    h('div.ligne.espace',
      h('div', { style: { minWidth: 0 } },
        h('h3', c.titre),
        h('div.tres-discret', [c.artiste, c.connu ? c.support : null].filter(Boolean).join(' · '))),
      puceNiveau(cfg, o.niveau)),
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
          }, 'Restaurer')))));
}

function emplacementVide(app, e, cfg) {
  return h('button.emplacement-vide', { type: 'button', onclick: () => choisirOeuvre(app, e, cfg) },
    icone('ajouter'), 'Placer une œuvre');
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

/**
 * Choix de la session : minutée (de 10 min à 7 h, à la minute près) ou libre
 * (sans durée, avec des pauses, jusqu'à 7 h de travail).
 */
export function choisirDuree(app, o) {
  const { jeu } = app;
  const cfg = jeu.cfg;
  const e = jeu.etat;
  const s = cfg.session;
  let minutes = Math.min(s.dureeMaxMin, Math.max(s.dureeMinMin, e.reglages.dureeSession || s.dureeDefautMin));
  let libre = !!e.reglages.sessionLibre;
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

  const projeter = (m) => resultatSession(cfg, { debut: 0, dureeMin: s.dureeMaxMin, figes }, m * 60e3, { arrieres: e.personnel?.arrieres || 0 });
  // Session libre : le temps qu'il faudrait pour finir l'œuvre.
  function ligneFin() {
    const max = projeter(s.dureeMaxMin);
    if (max.progressionApres < 1) {
      return h('div.ligne.espace', h('span.discret', `En ${duree(s.dureeMaxMin)}`), h('b.nombre', `${pourcent(max.progressionAvant)} → ${pourcent(max.progressionApres)}`));
    }
    let bas = s.seuilArretMin;
    let haut = s.dureeMaxMin;
    while (bas < haut) {
      const m = Math.floor((bas + haut) / 2);
      if (projeter(m).progressionApres >= 1) haut = m; else bas = m + 1;
    }
    return h('div.ligne.espace', h('span.discret', 'Restaurée en'), h('b.nombre', duree(bas)));
  }

  const onglets = h('div.onglets');
  const reglage = h('div.pile',
    valeur,
    h('div.ligne', pas(-10), pas(-1), curseur, pas(1), pas(10)),
    h('div.raccourcis', raccourcis));

  function maj() {
    vider(onglets, [[false, 'Minuteur'], [true, 'Libre']].map(([id, nom]) => h('button', {
      type: 'button', classe: libre === id ? 'actif' : '', onclick: () => { libre = id; maj(); },
    }, nom)));
    reglage.hidden = libre;
    valeur.textContent = duree(minutes);
    const r = projeter(libre ? 60 : minutes);
    vider(details,
      libre ? ligneFin() : null,
      libre ? h('div.fiche-legende', { style: { marginTop: '6px' } }, 'Pour 1 h') : null,
      h('div.ligne.espace', h('span.discret', 'Restauration'), h('b.nombre', `${pourcent(r.progressionAvant)} → ${pourcent(r.progressionApres)}`)),
      r.assistants.map((a) => ligneAssistant(app, a)),
      lignesFinances(r.finances),
      !libre && r.perdu > 0.5 ? h('div.ligne.espace', h('span.discret', 'Surplus perdu'), h('span', { style: { color: 'var(--rouge)' } }, duree(r.perdu))) : null,
    );
  }
  maj();

  const f = feuille({
    titre: cartel(app, o, null).titre,
    contenu: h('div.pile', onglets, reglage, details),
    actions: h('button.bouton.primaire.plein', {
      type: 'button', style: { marginTop: '14px' },
      onclick: async (ev) => {
        ev.currentTarget.disabled = true;
        const ok = await tenter(() => jeu.demarrerSession(o.id, minutes, { libre }));
        if (ok) {
          f.fermer();
          jeu.executer('reglages', { dureeSession: minutes, sessionLibre: libre }).catch(() => {});
        } else ev.currentTarget.disabled = false;
      },
    }, 'Lancer la session'),
  });
}

function maitrises(e, cfg) {
  const eff = effets(cfg, e).efficacite;
  return h('div',
    h('div.section', h('h2', 'Maîtrise'), eff ? h('span.aside', `Équipement +${Math.round(eff * 100)} %`) : null),
    h('div.carte', { style: { padding: '2px 16px' } }, cfg.supports.map((s) => {
      const p = progressionMaitrise(cfg, e.maitrise[s.id] || 0);
      return h('div.maitrise-ligne',
        h('b', s.nom, h('span.tres-discret', { style: { fontWeight: 400 } }, ` · niveau ${p.niveau}`)),
        h('span.tres-discret', p.prochain ? `${p.heures.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} / ${p.prochain} h` : `${Math.round(p.heures)} h`),
        jauge(p.part, 'or'),
        bonusMaitrise(cfg, e.maitrise[s.id] || 0) > 0.005
          ? h('span.tres-discret', `+${Math.round(bonusMaitrise(cfg, e.maitrise[s.id] || 0) * 100)} % d'efficacité`) : null);
    })));
}
