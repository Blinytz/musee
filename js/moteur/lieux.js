// Entrées et sorties des espaces publics : la nouveauté d'une œuvre en dépend.

import { joursPourNouveaute } from './regles.js';

/** Jours d'exposition équivalents à l'attrait d'une œuvre ravivée. */
export function ravivage(cfg) {
  return joursPourNouveaute(cfg, cfg.atelier?.nouveaute ?? cfg.visiteurs.nouveaute.depart);
}

/** Une œuvre quitte les espaces publics. */
export function sortirDuPublic(o, jour) {
  o.sortieLe = jour;
}

/**
 * Une œuvre entre dans un espace public : la nouveauté repart après 30 jours
 * d'absence, ou tout de suite si l'œuvre sort de l'atelier ou d'un repos en
 * collection privée (`ravivee`).
 */
export function entrerDansLePublic(cfg, o, jour) {
  if (o.sortieLe !== null && o.sortieLe !== undefined
    && jour - o.sortieLe >= cfg.visiteurs.nouveaute.reinitialisationApres) {
    o.joursExpo = 0;
  } else if (o.ravivee) {
    o.joursExpo = Math.min(o.joursExpo || 0, ravivage(cfg));
  }
  delete o.ravivee;
  o.sortieLe = null;
}
