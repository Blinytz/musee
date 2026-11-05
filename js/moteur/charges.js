// Charges horaires d'une session (docs/ECONOMIE.md, section 1), figées au
// lancement comme les recettes : accueil des visiteurs, entretien du
// bâtiment, assurance des œuvres exposées, fournitures de restauration. Les
// chantiers, eux, avancent pendant les sessions.

import { niveau } from './regles.js';
import { visiteursDuJour, coutVisiteur } from './visiteurs.js';
import { entretienHoraire } from './batiment.js';
import { probabilites } from './securite.js';
import { evenement } from './etat.js';

/** Valeur des œuvres exposées (salles et exposition), au prix du catalogue. */
export function valeurExposee(cfg, etat) {
  return Object.values(etat.oeuvres)
    .filter((o) => o.lieu === 'espace' || o.lieu === 'exposition')
    .reduce((s, o) => s + niveau(cfg, o.niveau).prix, 0);
}

/** Charges par heure de session, hors salaires, avec l'œuvre que l'on restaure. */
export function chargesHoraires(cfg, etat, jour, niveauOeuvre) {
  const c = cfg.charges;
  if (!c) return {};
  const risque = Object.values(probabilites(cfg, etat, jour)).reduce((t, p) => t + p, 0);
  return {
    accueil: visiteursDuJour(cfg, etat, jour) * coutVisiteur(cfg, etat),
    entretien: entretienHoraire(cfg, etat),
    assurance: valeurExposee(cfg, etat) * c.assurance.taux * (1 + c.assurance.risque * risque),
    fournitures: c.fournitures[niveauOeuvre] ?? 0,
  };
}

/* ---------- Chantiers ---------- */

/** Heures de session que demande un chantier. */
export function heuresChantier(cfg, quoi) {
  return cfg.chantiers?.heures?.[quoi] ?? 0;
}

/**
 * Ouvre un chantier. Sans heures configurées, l'ouvrage est livré aussitôt.
 * Renvoie true si le chantier attend des heures de session.
 */
export function ouvrirChantier(cfg, etat, chantier, jour) {
  const heures = heuresChantier(cfg, chantier.quoi);
  if (!heures) {
    livrer(cfg, etat, chantier, jour);
    return false;
  }
  etat.chantiers = [...(etat.chantiers || []), { ...chantier, heures, fait: 0 }];
  return true;
}

/** Les minutes d'une session font avancer les chantiers, un à la fois, dans l'ordre. */
export function avancerChantiers(cfg, etat, minutes, jour) {
  let reste = minutes / 60;
  const livres = [];
  while (reste > 1e-9 && etat.chantiers?.length) {
    const c = etat.chantiers[0];
    const pris = Math.min(reste, c.heures - c.fait);
    c.fait = Math.round((c.fait + pris) * 1000) / 1000;
    reste -= pris;
    if (c.fait >= c.heures - 1e-9) {
      etat.chantiers.shift();
      livrer(cfg, etat, c, jour);
      livres.push(c);
    }
  }
  return livres;
}

/** Un chantier terminé : l'aile, la salle, l'espace ou les places existent. */
function livrer(cfg, etat, c, jour) {
  const b = etat.batiment;
  if (c.quoi === 'aile') b.ailes += 1;
  else if (c.quoi === 'salle') {
    const s = b.salles.find((x) => x.id === c.cible);
    if (s) delete s.chantier;
  } else if (c.quoi === 'agrandissement') {
    const e = c.cible === 'cabinet' ? b.cabinet : b.salles.find((s) => s.id === c.cible);
    if (e) e.places = Math.min(cfg.batiment.agrandissement.max, e.places + cfg.batiment.agrandissement.places);
  } else if (c.quoi === 'espace') {
    const e = cfg.espaces[c.cible];
    b[c.cible] = { nom: e.nom, places: e.places, agrandissements: 0, theme: null };
  }
  if (jour !== undefined) evenement(etat, jour, 'chantier', { quoi: c.quoi, cible: c.cible, nom: c.nom });
}
