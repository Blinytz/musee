// Entrées et sorties des espaces publics : la nouveauté d'une œuvre en dépend.

/** Une œuvre quitte les espaces publics. */
export function sortirDuPublic(o, jour) {
  o.sortieLe = jour;
}

/** Une œuvre entre dans un espace public : la nouveauté repart après 30 jours d'absence. */
export function entrerDansLePublic(cfg, o, jour) {
  if (o.sortieLe !== null && o.sortieLe !== undefined
    && jour - o.sortieLe >= cfg.visiteurs.nouveaute.reinitialisationApres) {
    o.joursExpo = 0;
  }
  o.sortieLe = null;
}
