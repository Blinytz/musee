// Bâtiment : espaces publics, capacités, prix des agrandissements, règles
// d'accrochage. Une œuvre n'a qu'un emplacement, porté par l'œuvre elle-même
// (`lieu`, et `espace` + `place` quand elle est accrochée) : le contenu d'une
// salle se déduit des œuvres, il n'est jamais stocké deux fois.

import { effets } from './regles.js';

export const LIEUX = ['reserve', 'atelier', 'espace', 'privee', 'pret', 'exposition'];

/**
 * Espaces où l'on accroche en permanence : salles, cabinet, jardin. Une
 * salle encore en chantier n'en fait pas partie.
 */
export function espacesPublics(etat) {
  const b = etat.batiment;
  const liste = b.salles.filter((s) => !s.chantier).map((s) => ({ ...s, type: 'salle' }));
  if (b.cabinet) liste.push({ ...b.cabinet, id: 'cabinet', type: 'cabinet' });
  if (b.jardin) liste.push({ ...b.jardin, id: 'jardin', type: 'jardin' });
  // Une salle encore en chantier n'accueille personne.
  return liste;
}

export function espace(etat, id) {
  return espacesPublics(etat).find((e) => e.id === id) || null;
}

/** Œuvres accrochées dans un espace, indexées par place. */
export function contenuEspace(etat, id) {
  const e = espace(etat, id);
  const places = Array(e ? e.places : 0).fill(null);
  for (const o of Object.values(etat.oeuvres)) {
    if (o.lieu === 'espace' && o.espace === id && o.place < places.length) places[o.place] = o.id;
  }
  return places;
}

export function placesPubliques(etat) {
  let n = espacesPublics(etat).reduce((s, e) => s + e.places, 0);
  if (etat.batiment.exposition) n += etat.batiment.exposition.places;
  return n;
}

export function compter(etat, lieu) {
  return Object.values(etat.oeuvres).filter((o) => o.lieu === lieu).length;
}

export function reserveLibre(etat) {
  return etat.batiment.reserve.places - compter(etat, 'reserve');
}

export function priveeLibre(etat) {
  return etat.batiment.privee.places - compter(etat, 'privee');
}

/** Emplacements d'atelier : ceux du statut, plus ceux que l'on a ajoutés. */
export function emplacementsAtelier(cfg, etat) {
  return cfg.statuts[etat.statut].ateliers + (etat.batiment.atelier?.achats || 0);
}

export function prixAtelier(cfg, etat) {
  const a = cfg.batiment.atelier;
  const n = etat.batiment.atelier?.achats || 0;
  if (!a || n >= a.max) return null;
  return Math.round(a.prix * a.facteur ** n);
}

export function atelierLibre(cfg, etat) {
  return emplacementsAtelier(cfg, etat) - compter(etat, 'atelier');
}

/** Supports accrochables dans un espace. */
export function supportsEspace(cfg, type) {
  return cfg.espaces[type]?.supports || [];
}

/**
 * Raison pour laquelle une œuvre ne peut pas être accrochée dans cet espace,
 * ou null si elle le peut.
 */
export function refusAccrochage(cfg, etat, oeuvre, espaceId) {
  const e = espace(etat, espaceId);
  if (!e) return 'Espace inconnu';
  if (oeuvre.progression < 1) return 'Restauration inachevée';
  if (oeuvre.travaux) return 'En travaux à l\'atelier';
  if ((oeuvre.usure || 0) >= (cfg.usure?.maxExposable ?? Infinity)) return 'Trop abîmée : à réparer';
  if (!supportsEspace(cfg, e.type).includes(oeuvre.support)) {
    return oeuvre.support === 'estampe' || oeuvre.support === 'photographie'
      ? 'Réservé au cabinet d\'arts graphiques'
      : e.type === 'jardin' ? 'Sculptures uniquement' : 'Support non exposable ici';
  }
  const requise = cfg.securiteRequise[oeuvre.niveau] || 0;
  if (requise > normeLieu(cfg, etat, espaceId)) return `Sécurité niveau ${requise} requise dans cette salle`;
  return null;
}

/** Niveau de sécurité installé dans un espace (voir securite.js, normeDe). */
export function normeLieu(cfg, etat, lieu) {
  return (etat.securite?.salles?.[lieu] || []).reduce((n, id) => Math.max(n, cfg.materielSalle?.find((m) => m.id === id)?.norme || 0), 0);
}

/* ---------- Prix des agrandissements ---------- */

export function prixAile(cfg, etat) {
  const a = cfg.batiment.aile;
  if (etat.batiment.ailes >= a.max) return null;
  return Math.round(a.prix * a.facteur ** (etat.batiment.ailes - 1));
}

export function sallesParAile(etat) {
  const n = Array(etat.batiment.ailes).fill(0);
  for (const s of etat.batiment.salles) n[s.aile - 1] = (n[s.aile - 1] || 0) + 1;
  return n;
}

/** Première aile qui a encore de la place pour une salle, ou null. */
export function aileDisponible(cfg, etat) {
  const n = sallesParAile(etat);
  const i = n.findIndex((c) => c < cfg.batiment.aile.sallesMax);
  return i < 0 ? null : i + 1;
}

export function prixSalle(cfg, etat) {
  const s = cfg.batiment.salle;
  return Math.round(s.prix * s.facteur ** etat.batiment.sallesAchetees);
}

/** Prix du prochain agrandissement d'un espace, ou null au maximum (ou en chantier). */
export function prixAgrandissement(cfg, etat, espaceId) {
  const e = espace(etat, espaceId);
  if (!e || e.type === 'jardin') return null;
  if ((etat.chantiers || []).some((c) => c.quoi === 'agrandissement' && c.cible === espaceId)) return null;
  const a = cfg.batiment.agrandissement;
  const k = e.agrandissements || 0;
  if (k >= a.prix.length || e.places >= a.max) return null;
  return a.prix[k];
}

/**
 * Entretien du bâtiment, par heure de session : chaque espace public et
 * chaque aile, revalorisés avec le statut. Une salle vide coûte aussi.
 */
export function entretienHoraire(cfg, etat) {
  const c = cfg.charges?.entretien;
  if (!c) return 0;
  const espaces = espacesPublics(etat).length + (etat.batiment.exposition ? 1 : 0);
  const g = c.grille[etat.statut] ?? c.grille[c.grille.length - 1];
  return (espaces * c.espace + etat.batiment.ailes * c.aile) * g;
}

/** Ailes en construction : leurs futures salles ne sont pas encore achetables. */
export function chantiersEnCours(etat) {
  return etat.chantiers || [];
}

export function prixReserve(cfg, etat) {
  const r = cfg.batiment.reserve;
  return Math.round(r.prix * r.facteur ** etat.batiment.reserve.achats);
}

export function prixPrivee(cfg, etat) {
  const r = cfg.batiment.privee;
  return Math.round(r.prix * r.facteur ** etat.batiment.privee.achats);
}
