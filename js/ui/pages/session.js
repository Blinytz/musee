// Session de concentration (plein écran) et bilan de fin de session.

import { h, vider, icone, nombre, pourcent, duree, chrono, ajouter } from '../dom.js';
import { feuille, confirmer, tenter, jauge, imageOeuvre, graineOeuvre, annoncer, cartel, couleurMur } from '../composants.js';
import { dessiner, nettoyer, etape } from '../../rendu/restauration.js';
import { resultatSession, tempsActif, enPause, finPrevue } from '../../moteur/actions.js';
import { progressionMaitrise } from '../../moteur/regles.js';
import { espacesPublics, contenuEspace, refusAccrochage } from '../../moteur/batiment.js';

const signe = (n) => `${n < 0 ? '-' : '+'} ${nombre(Math.abs(n))}`;

/**
 * Affiche la session en cours ; `onFin(resultat)` à son terme. La toile part
 * de son état au lancement ; une fenêtre de nettoyage gagne la surface au fil
 * du temps et découvre l'état qu'elle aura à la fin de la session. En session
 * libre, la fin n'est pas connue : la fenêtre passe toutes les 10 minutes de
 * travail, et le chrono monte au lieu de descendre.
 */
export function afficherSession(app, { onFin }) {
  const { jeu } = app;
  const s0 = jeu.etat.session;
  const libre = !!s0.libre;
  // La session change d'objet à chaque pause ou reprise : toujours la relire.
  const sess = () => jeu.etat.session || s0;
  const cfg = jeu.cfg;
  const o = jeu.etat.oeuvres[s0.oeuvre];
  const support = o?.support || 'peinture';
  const graine = graineOeuvre(s0.oeuvre);
  // Ce que la session aurait produit si elle s'arrêtait à cet instant, sans
  // le seuil des 10 minutes : sert à l'étape affichée.
  const sansSeuil = { ...cfg, session: { ...cfg.session, seuilArretMin: 0 } };
  const contexte = { arrieres: jeu.etat?.personnel?.arrieres || 0 };
  const capMs = s0.dureeMin * 60e3;
  // Progression après `ms` de travail.
  const progressionA = (ms) => resultatSession(sansSeuil, { debut: 0, dureeMin: s0.dureeMin, figes: s0.figes }, ms, contexte).progressionApres;
  const projete = resultatSession(sansSeuil, { debut: 0, dureeMin: s0.dureeMin, figes: s0.figes }, capMs, contexte);
  const pAvant = projete.progressionAvant;
  const pFin = projete.progressionApres;
  const FENETRE = 10 * 60e3;

  const canvas = document.createElement('canvas');
  const cadre = h('div.cadre', { classe: `cadre-${support}` }, canvas);
  const toile = h('div.session-toile', cadre);
  const compte = h('div.compte');
  const nomEtape = h('small');
  const etapes = h('div.etapes', { 'aria-hidden': 'true' });
  const restauration = h('b');
  const net = h('b', { style: { color: 'var(--accent)' } });

  function confirmerFin(libelle) {
    const ecoule = tempsActif(sess(), jeu.maintenant()) / 60e3;
    return confirmer(`${libelle} la session ?`, {
      texte: ecoule < cfg.session.seuilArretMin ? `Moins de ${cfg.session.seuilArretMin} min : rien ne sera compté.` : null,
      oui: libelle, danger: true,
    });
  }

  async function terminer(retenuMin = null) {
    arreter.disabled = true;
    const r = await tenter(() => jeu.terminerSession({ anticipe: true, retenuMin }));
    if (r) fin();
    else arreter.disabled = false;
  }

  // Validation d'une session libre : le temps compté peut être réduit, pour
  // retirer une pause oubliée, jamais augmenté.
  function validerLibre() {
    const s = sess();
    const maxMin = Math.floor(Math.min(capMs, tempsActif(s, jeu.maintenant())) / 60e3);
    let minutes = maxMin;
    const valeur = h('div.compte', { style: { fontSize: '44px' } });
    const details = h('div.pile', { style: { gap: '6px' } });
    const curseur = h('input', {
      type: 'range', min: 0, max: maxMin, step: 1, value: minutes,
      style: { width: '100%', accentColor: 'var(--accent)' },
      oninput: () => regler(Number(curseur.value)),
    });
    const pas = (d) => h('button.bouton.petit', { type: 'button', onclick: () => regler(minutes + d) }, d > 0 ? `+${d}` : `${d}`);
    const plus = [pas(1), pas(10)];
    function regler(m) {
      minutes = Math.min(maxMin, Math.max(0, Math.round(m)));
      curseur.value = minutes;
      maj();
    }
    function maj() {
      valeur.textContent = duree(minutes);
      for (const b of plus) b.disabled = minutes >= maxMin;
      const r = resultatSession(cfg, s, jeu.maintenant(), { ...contexte, retenuMin: minutes });
      vider(details,
        h('div.ligne.espace', h('span.discret', 'Restauration'), h('b.nombre', `${pourcent(r.progressionAvant)} → ${pourcent(r.progressionApres)}`)),
        h('div.ligne.espace', h('span.discret', 'Net'), h('b.nombre', `${signe(r.eclats)} ✦`)),
        r.minutes === 0 ? h('p.discret', `Moins de ${cfg.session.seuilArretMin} min : rien ne sera compté.`) : null);
    }
    maj();
    const f = feuille({
      titre: 'Terminer la session ?',
      contenu: h('div.pile',
        h('div.fiche-legende', 'Temps travaillé'),
        valeur,
        h('div.ligne', pas(-10), pas(-1), curseur, ...plus),
        details),
      actions: h('div.rangee-boutons', { style: { marginTop: '14px' } },
        h('button.bouton', { type: 'button', onclick: () => f.fermer() }, 'Annuler'),
        h('button.bouton.primaire', {
          type: 'button',
          onclick: () => {
            f.fermer();
            // Sans réglage, tout le temps compté jusqu'à l'arrêt.
            terminer(minutes < maxMin ? minutes : null);
          },
        }, 'Terminer')),
    });
  }

  const arreter = h('button.bouton.plein', {
    type: 'button',
    onclick: async () => {
      if (libre) { validerLibre(); return; }
      if (await confirmerFin('Arrêter')) terminer();
    },
  }, libre ? 'Terminer' : 'Arrêter');

  const basculer = libre ? h('button.bouton.primaire.plein', {
    type: 'button',
    onclick: async () => {
      basculer.disabled = true;
      await tenter(() => (enPause(sess()) ? jeu.reprendre() : jeu.pause()));
      basculer.disabled = false;
      tic();
    },
  }) : null;

  const racine = h('div#session', { role: 'dialog', 'aria-label': 'Session en cours', style: { '--mur': couleurMur(null, 0) } },
    h('div.session-tete',
      h('div', { style: { minWidth: 0 } }, h('h2', cartel(app, o, null).titre),
        h('div.tres-discret', libre ? 'Session libre' : `Session · ${duree(s0.dureeMin)}`)),
      etapes),
    toile,
    h('div.session-plaque', h('div.plaque', compte, nomEtape)),
    h('div.session-pied',
      h('div.chiffres-session',
        h('div', restauration, h('span', 'restauration')),
        h('div', net, h('span', libre ? 'net à cet instant' : 'net à la fin'))),
      libre ? h('div.rangee-boutons', basculer, arreter) : arreter));
  ajouter(document.body, racine);
  if (!libre) {
    restauration.textContent = `${pourcent(pAvant)} → ${pourcent(pFin)}`;
    net.textContent = `${signe(projete.eclats)} ✦`;
  }

  let image = null;
  let avant = null;
  let apres = null;
  let fenetre = -1;
  let echeance = false;
  let minuterie = null;
  let termine = false;
  let ratio = 0.8;

  // La toile occupe toute la place libre entre l'en-tête et la plaque.
  function ajuster() {
    const st = getComputedStyle(toile);
    const l = toile.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight);
    const hh = toile.clientHeight - parseFloat(st.paddingTop) - parseFloat(st.paddingBottom);
    if (l <= 0 || hh <= 0) return;
    const w = Math.min(l, hh * ratio);
    canvas.style.width = `${Math.round(w)}px`;
    canvas.style.height = `${Math.round(w / ratio)}px`;
  }
  // La place libre change avec la fenêtre et avec le pied (boutons de pause).
  const observateur = new ResizeObserver(ajuster);
  observateur.observe(toile);

  // Les deux états entre lesquels passe la fenêtre de nettoyage : toute la
  // session minutée, ou la tranche de 10 minutes en cours d'une session libre.
  function preparer(k) {
    fenetre = k;
    const [p1, p2] = libre ? [progressionA(k * FENETRE), progressionA(Math.min(capMs, (k + 1) * FENETRE))] : [pAvant, pFin];
    for (const [c, p] of [[avant, p1], [apres, p2]]) {
      c.width = canvas.width;
      c.height = canvas.height;
      dessiner(c, image, { progression: p, support, graine, rendu: cfg.rendu });
    }
  }

  (async () => {
    const fiche = await app.fiche(s0.oeuvre);
    image = await imageOeuvre(app, fiche, o, 1400);
    if (termine) return;
    ratio = image ? image.naturalWidth / image.naturalHeight : 0.8;
    const base = Math.round(900 * Math.min(2, devicePixelRatio || 1) / 1.4);
    const [w, hh] = ratio >= 1 ? [base, Math.max(1, Math.round(base / ratio))] : [Math.max(1, Math.round(base * ratio)), base];
    canvas.width = w;
    canvas.height = hh;
    avant = document.createElement('canvas');
    apres = document.createElement('canvas');
    ajuster();
    tic();
  })();

  function tic() {
    if (termine) return;
    clearTimeout(minuterie);
    const s = sess();
    const maintenant = jeu.maintenant();
    const pause = enPause(s);
    const actif = Math.min(capMs, tempsActif(s, maintenant));
    let p;
    let part;
    if (libre) {
      compte.textContent = chrono(actif);
      p = progressionA(actif);
      restauration.textContent = `${pourcent(pAvant)} → ${pourcent(p)}`;
      net.textContent = `${signe(resultatSession(cfg, s, maintenant, contexte).eclats)} ✦`;
      // Le bouton ne change qu'avec l'état : le recréer à chaque seconde
      // ferait perdre un appui commencé sur l'icône.
      basculer.disabled = pause && actif >= capMs;
      if (basculer.dataset.pause !== String(pause)) {
        basculer.dataset.pause = String(pause);
        basculer.replaceChildren(icone(pause ? 'lancer' : 'pause'), pause ? 'Reprendre' : 'Pause');
        racine.classList.toggle('en-pause', pause);
      }
      const k = Math.min(Math.floor(actif / FENETRE), Math.ceil(capMs / FENETRE) - 1);
      if (avant && k !== fenetre) preparer(k);
      part = (actif - k * FENETRE) / FENETRE;
    } else {
      compte.textContent = chrono(finPrevue(s) - maintenant);
      p = progressionA(actif);
      if (avant && fenetre < 0) preparer(0);
      part = actif / capMs;
    }
    const et = etape(cfg.rendu, p);
    nomEtape.textContent = pause ? 'En pause' : p >= 1 ? 'Restaurée' : et.nom;
    vider(etapes, cfg.rendu.etapes.map((_, i) => h('i', { classe: i < et.index || p >= 1 ? 'faite' : i === et.index ? 'courante' : '' })));
    if (avant) nettoyer(canvas, avant, apres, part, graine);
    if (!pause && maintenant >= finPrevue(s)) {
      if (!libre) {
        tenter(() => jeu.terminerSession()).then(() => fin());
        return;
      }
      // Session libre à 7 h : elle se met en pause, reste à la valider.
      if (!echeance) {
        echeance = true;
        tenter(() => jeu.terminerSession()).finally(() => { minuterie = setTimeout(() => { echeance = false; tic(); }, 1500); });
      }
      return;
    }
    minuterie = setTimeout(tic, 1000 - (maintenant % 1000) + 5);
  }

  function fermer() {
    termine = true;
    clearTimeout(minuterie);
    observateur.disconnect();
    racine.remove();
  }

  function fin() {
    if (termine) return;
    fermer();
    onFin?.();
  }

  return { fermer };
}

/**
 * Ce que devient l'argent des visites : le billet encaissé en entier, puis
 * chaque dépense en clair, puis l'impôt. Une ligne nulle n'est pas affichée.
 */
export function lignesFinances(f) {
  const n = (x) => Math.round(x).toLocaleString('fr-FR');
  const ligne = (libelle, valeur, style) => h('div.ligne.espace', h('span.discret', libelle), h('span.nombre', { style }, valeur));
  const moins = (libelle, x) => (x > 0.5 ? ligne(libelle, `-${n(x)} ✦`) : null);
  return [
    ligne('Recettes', `${n(f.recettes)} ✦`),
    f.indemnites > 0.5 ? ligne('Indemnités d\'assurance', `${n(f.indemnites)} ✦`) : null,
    moins('Accueil des visiteurs', f.accueil || 0),
    moins('Salaires', f.salaires + (f.arrieresPayes || 0)),
    moins('Entretien', f.entretien || 0),
    moins('Assurance', f.assurance || 0),
    moins('Fournitures', f.fournitures || 0),
    moins('Primes des détectives', f.primes || 0),
    moins('Impôts', f.impot),
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
  const largeur = Math.round(Math.min(innerWidth - 90, 480, innerHeight * 0.42 * r));
  const comparaison = h('div.comparaison', { style: { width: `${largeur}px`, height: 'auto' } },
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

  // À 100 %, l'œuvre livre tout ce qu'elle cachait : titre, artiste, date.
  const revelation = fini ? h('div.revelation',
    h('h3', fiche?.titre || o?.titre || '?'),
    h('div.discret', [fiche?.artiste?.nom || o?.artiste?.nom, fiche?.an ?? o?.an].filter((x) => x !== null && x !== undefined && x !== '').join(' · '))) : null;

  feuille({
    titre: fini ? 'Restaurée' : etape(cfg.rendu, resultat.progressionApres).nom,
    contenu: h('div.pile',
      h('div.cadre-bilan', { style: { '--mur': couleurMur(null, 0) } },
        h('div.cadre', { classe: `cadre-${s.support || 'peinture'}`, style: { width: `${largeur}px` } }, comparaison),
        revelation),
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
