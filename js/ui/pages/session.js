// Session de concentration (plein écran) et bilan de fin de session.

import { h, vider, icone, nombre, pourcent, duree, chrono, ajouter } from '../dom.js';
import { feuille, confirmer, tenter, jauge, imageOeuvre, graineOeuvre, annoncer, cartel } from '../composants.js';
import { dessiner, chargerImage, etape } from '../../rendu/restauration.js';
import { resultatSession } from '../../moteur/actions.js';
import { progressionMaitrise } from '../../moteur/regles.js';
import { espacesPublics, contenuEspace, refusAccrochage } from '../../moteur/batiment.js';

/** Affiche la session en cours ; `onFin(resultat)` à son terme. */
export function afficherSession(app, { onFin }) {
  const { jeu } = app;
  const s = jeu.etat.session;
  const cfg = jeu.cfg;
  const o = jeu.etat.oeuvres[s.oeuvre];
  const canvas = document.createElement('canvas');
  const compte = h('div.compte');
  const pourcentage = h('b.nombre');
  const nomEtape = h('span.discret');
  const barre = h('div');
  const gains = h('span.eclats');
  const arreter = h('button.bouton.plein', {
    type: 'button',
    onclick: async () => {
      const ecoule = (jeu.maintenant() - s.debut) / 60e3;
      const ok = await confirmer('Arrêter la session ?', {
        texte: ecoule < cfg.session.seuilArretMin ? `Moins de ${cfg.session.seuilArretMin} min : rien ne sera compté.` : null,
        oui: 'Arrêter', danger: true,
      });
      if (!ok) return;
      arreter.disabled = true;
      const r = await tenter(() => jeu.terminerSession({ anticipe: true }));
      if (r) fin();
      else arreter.disabled = false;
    },
  }, icone('arreter'), 'Arrêter');

  const racine = h('div#session', { role: 'dialog', 'aria-label': 'Session en cours' },
    h('div.ligne.espace', { style: { maxWidth: '520px', width: '100%', margin: '0 auto' } },
      h('div', { style: { minWidth: 0 } }, h('h2', cartel(app, o, null).titre), nomEtape),
      h('span.puce', icone('sablier'), duree(s.dureeMin))),
    h('div.session-toile', canvas),
    h('div.session-pied',
      compte,
      h('div.ligne.espace', h('span.discret', 'Restauration'), pourcentage),
      barre,
      h('div.ligne.espace', h('span.discret', 'Éclats'), gains),
      arreter));
  ajouter(document.body, racine);

  let image = null;
  let dernierRendu = -1;
  let minuterie = null;
  let termine = false;

  (async () => {
    const fiche = await app.fiche(s.oeuvre);
    image = await imageOeuvre(app, fiche, o, 1400);
    const r = image ? image.naturalWidth / image.naturalHeight : 0.8;
    const base = Math.round(900 * Math.min(2, devicePixelRatio || 1) / 1.4);
    if (r >= 1) { canvas.width = base; canvas.height = Math.round(base / r); } else { canvas.height = base; canvas.width = Math.round(base * r); }
    dernierRendu = -1;
    tic();
  })();

  function tic() {
    if (termine) return;
    const maintenant = jeu.maintenant();
    const finPrevue = s.debut + s.dureeMin * 60e3;
    compte.textContent = chrono(finPrevue - maintenant);
    // Progression « virtuelle » : ce que la session aurait produit si elle
    // s'arrêtait maintenant, sans le seuil des 10 minutes.
    const ecoule = Math.min(s.dureeMin, Math.max(0, (maintenant - s.debut) / 60e3));
    const virtuelle = resultatSession({ ...cfg, session: { ...cfg.session, seuilArretMin: 0 } }, { ...s, dureeMin: s.dureeMin }, s.debut + ecoule * 60e3,
      { arrieres: jeu.etat?.personnel?.arrieres || 0 });
    const p = virtuelle.progressionApres;
    pourcentage.textContent = pourcent(p, 1);
    nomEtape.textContent = etape(cfg.rendu, p).nom;
    vider(barre, jauge(p));
    gains.textContent = nombre(virtuelle.eclats);
    if (canvas.width && Math.abs(p - dernierRendu) >= 0.002) {
      dernierRendu = p;
      dessiner(canvas, image, { progression: p, support: o?.support, graine: graineOeuvre(s.oeuvre), rendu: cfg.rendu });
    }
    if (maintenant >= finPrevue) {
      tenter(() => jeu.terminerSession()).then(() => fin());
      return;
    }
    minuterie = setTimeout(tic, 1000 - (maintenant % 1000) + 5);
  }

  function fin() {
    if (termine) return;
    termine = true;
    clearTimeout(minuterie);
    racine.remove();
    onFin?.();
  }

  return {
    fermer() {
      termine = true;
      clearTimeout(minuterie);
      racine.remove();
    },
  };
}

/**
 * Recettes, salaires, impôts, net : ce que devient l'argent des visites.
 * `f` : recettes, salaires, arrieresPayes, arrieresRestants, impot, net.
 */
export function lignesFinances(f) {
  const n = (x) => Math.round(x).toLocaleString('fr-FR');
  const ligne = (libelle, valeur, style) => h('div.ligne.espace', h('span.discret', libelle), h('span.nombre', { style }, valeur));
  return [
    ligne('Recettes', `${n(f.recettes)} ✦`),
    f.salaires + (f.arrieresPayes || 0) > 0.5 ? ligne('Salaires', `-${n(f.salaires + (f.arrieresPayes || 0))} ✦`) : null,
    f.impot > 0.5 ? ligne('Impôts', `-${n(f.impot)} ✦`) : null,
    f.arrieresRestants > 0.5 ? ligne('Arriérés', `${n(f.arrieresRestants)} ✦`, { color: 'var(--rouge)' }) : null,
    h('div.ligne.espace', h('b', 'Net'), h('span.eclats', n(f.net))),
  ];
}

/** Ce qu'un assistant a avancé : son nom et sa progression, l'œuvre en dessous. */
export function ligneAssistant(app, a) {
  return h('div',
    h('div.ligne.espace', h('span.discret', a.nom), h('span.nombre', `${pourcent(a.avant)} → ${pourcent(a.apres)}`)),
    h('div.tres-discret', cartel(app, app.jeu.etat.oeuvres[a.oeuvre], null).titre));
}

/** Écran de fin : avant / après, gain, étape, Éclats, maîtrise, surplus perdu. */
export async function afficherBilan(app, resultat) {
  const { jeu } = app;
  const cfg = jeu.cfg;
  const s = resultat.session;
  const o = jeu.etat.oeuvres[s.oeuvre];
  const fiche = await app.fiche(s.oeuvre);
  const image = await imageOeuvre(app, fiche, o, 1200);
  const r = image ? image.naturalWidth / image.naturalHeight : 0.8;
  const L = Math.round(760 * Math.min(2, devicePixelRatio || 1) / 1.4);
  const dims = r >= 1 ? [L, Math.round(L / r)] : [Math.round(L * r), L];
  const avant = h('canvas', { width: dims[0], height: dims[1] });
  const apres = h('canvas.apres', { width: dims[0], height: dims[1] });
  const graine = graineOeuvre(s.oeuvre);
  dessiner(avant, image, { progression: resultat.progressionAvant, support: s.support, graine, rendu: cfg.rendu });
  dessiner(apres, image, { progression: resultat.progressionApres, support: s.support, graine, rendu: cfg.rendu });

  const curseur = h('div.curseur');
  // L'image ne dépasse pas la moitié de l'écran en hauteur : les chiffres
  // du bilan doivent rester visibles sans défiler.
  const comparaison = h('div.comparaison', { style: { maxWidth: `${Math.round(Math.min(520, innerHeight * 0.48 * r))}px`, margin: '0 auto', width: '100%' } },
    avant, apres, curseur,
    h('span.etiquette', { style: { left: '8px' } }, 'Avant'),
    h('span.etiquette', { style: { right: '8px' } }, 'Après'));
  function placer(x) {
    const b = comparaison.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (x - b.left) / b.width));
    apres.style.clipPath = `inset(0 0 0 ${t * 100}%)`;
    curseur.style.left = `${t * 100}%`;
  }
  comparaison.addEventListener('pointerdown', (e) => {
    comparaison.setPointerCapture(e.pointerId);
    placer(e.clientX);
    const bouger = (ev) => placer(ev.clientX);
    comparaison.addEventListener('pointermove', bouger);
    comparaison.addEventListener('pointerup', () => comparaison.removeEventListener('pointermove', bouger), { once: true });
  });
  requestAnimationFrame(() => {
    apres.style.clipPath = 'inset(0 0 0 50%)';
    curseur.style.left = '50%';
  });

  const mAvant = progressionMaitrise(cfg, resultat.maitriseAvant);
  const mApres = progressionMaitrise(cfg, resultat.maitriseApres);
  const gagne = resultat.progressionApres - resultat.progressionAvant;
  const fini = resultat.progressionApres >= 1;

  feuille({
    titre: fini ? 'Restaurée' : etape(cfg.rendu, resultat.progressionApres).nom,
    contenu: h('div.pile',
      comparaison,
      h('div.chiffres',
        h('div.chiffre', h('span', 'Restauration'), h('b', `+${pourcent(gagne, 1)}`), h('small', `${pourcent(resultat.progressionApres, 1)}`)),
        h('div.chiffre', h('span', 'Éclats'), h('b.eclats', nombre(resultat.eclats)), h('small', duree(resultat.minutes))),
        h('div.chiffre', h('span', 'Maîtrise'), h('b', mApres.niveau > mAvant.niveau ? `${mAvant.niveau} → ${mApres.niveau}` : `${mApres.niveau}`),
          h('div', { style: { marginTop: '6px' } }, jauge(mApres.part, 'or'))),
        resultat.perdu > 0.5
          ? h('div.chiffre', h('span', 'Surplus perdu'), h('b', { style: { color: 'var(--rouge)' } }, duree(resultat.perdu)))
          : null),
      resultat.minutes === 0 ? h('p.discret', `Moins de ${cfg.session.seuilArretMin} min : rien n'a été compté.`) : null,
      resultat.finances ? h('div.carte.pile', { style: { gap: '6px' } }, lignesFinances(resultat.finances)) : null,
      (s.assistants || []).length ? h('div.carte.pile', { style: { gap: '8px' } }, s.assistants.map((a) => ligneAssistant(app, a))) : null,
      (s.promotions || []).map((p) => h('div.carte.ligne', icone('maitrise'), h('span', `${p.nom} passe niveau ${p.niveau}`))),
      fini ? h('div.rangee-boutons', placerApresRestauration(app, s.oeuvre)) : null),
  });
}

/** Boutons de destination d'une œuvre tout juste restaurée. */
export function placerApresRestauration(app, id) {
  const { jeu } = app;
  const choix = async (vers) => {
    const ok = await app.agir('deplacer', { oeuvre: id, vers });
    if (ok) document.querySelector('.voile-fond')?.remove();
  };
  const sallePourOeuvre = () => {
    const e = jeu.etat;
    const o = e.oeuvres[id];
    for (const sp of espacesPublics(e)) {
      if (refusAccrochage(jeu.cfg, e, o, sp.id)) continue;
      const i = contenuEspace(e, sp.id).indexOf(null);
      if (i >= 0) return { lieu: 'espace', espace: sp.id, place: i };
    }
    return null;
  };
  return [
    h('button.bouton.primaire', {
      type: 'button',
      onclick: () => {
        const v = sallePourOeuvre();
        if (v) choix(v); else annoncer('Aucune place libre en salle', { erreur: true });
      },
    }, 'Salle'),
    h('button.bouton', { type: 'button', onclick: () => choix({ lieu: 'privee' }) }, 'Privée'),
    h('button.bouton', { type: 'button', onclick: () => choix({ lieu: 'reserve' }) }, 'Réserve'),
  ];
}
