// Visiteurs, satisfaction et réputation.
//
// Visiteurs par jour = Σ (10 × prestige × nouveauté × cohérence × espace)
//   sur les œuvres en salle publique et en exposition temporaire,
//   × (0,5 + réputation / 100) × facteur prix × effet des campagnes.

import {
  prestige, nouveaute, estConforme, facteurPrix, facteurReputation, effets, borner,
} from './regles.js';
import { espacesPublics, placesPubliques, contenuEspace } from './batiment.js';
import { effetsPersonnel } from './personnel.js';
import { facteurUsure } from './atelier.js';

/**
 * Espaces ouverts : une salle n'ouvre que si un gardien la tient. Les
 * gardiens vont d'abord aux espaces qui ont le plus de prestige accroché ;
 * l'exposition temporaire en cours en demande un aussi. Un espace vide n'a
 * besoin de personne.
 */
export function espacesOuverts(cfg, etat, jour) {
  const aGarder = [];
  for (const e of espacesPublics(etat)) {
    const ids = contenuEspace(etat, e.id).filter((x) => x !== null);
    if (ids.length) aGarder.push({ id: e.id, valeur: ids.reduce((s, id) => s + prestige(cfg, etat.oeuvres[id].niveau), 0) });
  }
  const x = etat.expositions?.courante;
  if (x && (jour === undefined || (jour >= x.debut && jour < x.fin))) {
    const valeur = x.oeuvres.reduce((s, id) => s + prestige(cfg, etat.oeuvres[id]?.niveau ?? 0), 0)
      + x.emprunts.reduce((s, em) => s + prestige(cfg, em.niveau), 0);
    aGarder.push({ id: 'exposition', valeur });
  }
  aGarder.sort((a, b) => b.valeur - a.valeur || String(a.id).localeCompare(String(b.id)));
  const gardiens = effetsPersonnel(cfg, etat).gardiens;
  const ouverts = new Set(aGarder.slice(0, gardiens).map((e) => e.id));
  return { ouverts, aGarder: aGarder.length, fermes: aGarder.slice(gardiens).map((e) => e.id) };
}

/** Multiplicateur des campagnes actives le jour `jour`. */
export function effetCampagnes(cfg, etat, jour) {
  const c = etat.campagne;
  if (!c || jour < c.debut || jour >= c.fin) return 1;
  return cfg.campagnes.find((x) => x.id === c.id)?.multiplicateur ?? 1;
}

/**
 * Apport de chaque œuvre exposée, avant les multiplicateurs globaux.
 * Renvoie [{ id, emprunt, espace, valeur }].
 */
export function apports(cfg, etat, jour) {
  const liste = [];
  const parId = new Map(espacesPublics(etat).map((e) => [e.id, e]));
  const { ouverts } = espacesOuverts(cfg, etat, jour);
  for (const o of Object.values(etat.oeuvres)) {
    if (o.lieu !== 'espace') continue;
    const e = parId.get(o.espace);
    if (!e || !ouverts.has(e.id)) continue;
    const coherence = e.theme
      ? (estConforme(o, e.theme) ? cfg.visiteurs.theme.conforme : cfg.visiteurs.theme.nonConforme)
      : 1;
    const attrait = cfg.espaces[e.type]?.attrait ?? 1;
    liste.push({
      id: o.id, espace: e.id,
      valeur: cfg.visiteurs.parPrestige * prestige(cfg, o.niveau) * nouveaute(cfg, o.joursExpo) * coherence * attrait * facteurUsure(cfg, o),
    });
  }
  const expo = etat.expositions?.courante;
  if (expo && jour >= expo.debut && jour < expo.fin && ouverts.has('exposition')) {
    // Le commissaire d'exposition rend l'exposition plus attrayante.
    const commissaire = effetsPersonnel(cfg, etat).commissaire;
    const x = { ...cfg.expositions, attrait: cfg.expositions.attrait * (1 + (commissaire?.attrait || 0)) };
    for (const id of expo.oeuvres) {
      const o = etat.oeuvres[id];
      if (!o || o.lieu !== 'exposition') continue;
      liste.push({
        id, espace: 'exposition',
        valeur: cfg.visiteurs.parPrestige * prestige(cfg, o.niveau) * nouveaute(cfg, o.joursExpo) * x.coherence * x.attrait,
      });
    }
    for (const em of expo.emprunts) {
      liste.push({
        id: em.id, emprunt: true, espace: 'exposition',
        valeur: cfg.visiteurs.parPrestige * prestige(cfg, em.niveau) * nouveaute(cfg, jour - expo.debut) * x.coherence * x.attrait,
      });
    }
  }
  return liste;
}

/** Multiplicateur global appliqué à la somme des apports. */
export function multiplicateurGlobal(cfg, etat, jour) {
  // Un chantier en cours gêne la visite.
  const travaux = (etat.chantiers || []).length ? (cfg.chantiers?.malus ?? 1) : 1;
  return facteurReputation(cfg, etat.reputation)
    * facteurPrix(cfg, etat.prixBillet, etat.reputation)
    * effetCampagnes(cfg, etat, jour)
    * travaux;
}

/** Visiteurs attendus le jour `jour` avec l'état tel qu'il est. */
export function visiteursDuJour(cfg, etat, jour) {
  const total = apports(cfg, etat, jour).reduce((s, a) => s + a.valeur, 0);
  return Math.round(total * multiplicateurGlobal(cfg, etat, jour));
}

/** Détail du calcul, pour l'écran Rapport et la fiche d'œuvre. */
export function detailVisiteurs(cfg, etat, jour) {
  const liste = apports(cfg, etat, jour);
  const m = multiplicateurGlobal(cfg, etat, jour);
  return {
    total: Math.round(liste.reduce((s, a) => s + a.valeur, 0) * m),
    multiplicateur: m,
    parOeuvre: liste.map((a) => ({ ...a, visiteurs: a.valeur * m })),
  };
}

/** Recettes par heure de session, figées au lancement : le billet en entier. */
export function tauxHoraire(cfg, etat, jour) {
  const v = visiteursDuJour(cfg, etat, jour);
  return v * etat.prixBillet * effets(cfg, etat).revenus;
}

/** Coût d'un visiteur selon le statut (ménage, énergie, billetterie). */
export function coutVisiteur(cfg, etat) {
  const a = cfg.charges?.accueil || [0];
  return a[etat.statut] ?? a[a.length - 1];
}

/** Part des espaces thématiques cohérents parmi les espaces garnis. */
export function partThematique(cfg, etat) {
  let garnis = 0;
  let coherents = 0;
  for (const e of espacesPublics(etat)) {
    const oeuvres = Object.values(etat.oeuvres).filter((o) => o.lieu === 'espace' && o.espace === e.id);
    if (!oeuvres.length) continue;
    garnis++;
    if (!e.theme) continue;
    const conformes = oeuvres.filter((o) => estConforme(o, e.theme)).length;
    if (conformes / oeuvres.length >= cfg.satisfaction.seuilCoherence) coherents++;
  }
  return garnis ? coherents / garnis : 0;
}

/** Seuil d'affluence : les agents d'accueil l'élèvent. */
export function seuilDensite(cfg, etat) {
  return cfg.satisfaction.densiteSeuil * (1 + effetsPersonnel(cfg, etat).densite);
}

export function penaliteAffluence(cfg, etat, visiteurs) {
  const s = cfg.satisfaction;
  const places = placesPubliques(etat);
  if (!places) return 0;
  const densite = visiteurs / places;
  const seuil = seuilDensite(cfg, etat);
  if (densite <= seuil) return 0;
  return Math.min(s.penaliteMax, (densite / seuil - 1) * s.penaliteCoef);
}

export function satisfaction(cfg, etat, visiteurs) {
  const s = cfg.satisfaction;
  const v = s.base
    + effets(cfg, etat).satisfaction
    + effetsPersonnel(cfg, etat).satisfaction
    + s.bonusThematique * partThematique(cfg, etat)
    - penaliteAffluence(cfg, etat, visiteurs);
  return borner(v, 0, 100);
}

/** Cible de réputation : satisfaction + bonus permanents, plafonnée. */
export function cibleReputation(cfg, etat, sat) {
  return Math.min(cfg.reputation.max, sat + (etat.bonusPermanents || 0));
}

export function reputationSuivante(cfg, etat, sat) {
  const cible = cibleReputation(cfg, etat, sat);
  return borner(etat.reputation + cfg.reputation.vitesse * (cible - etat.reputation), 0, cfg.reputation.max);
}
