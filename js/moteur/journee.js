// La journée simulée. À 4 h, l'Edge Function ferme la veille (visiteurs,
// satisfaction, réputation, statut, classement) puis ouvre le jour (fins de
// prêt et d'exposition, arrivage du lundi, demande de prêt, rapport).
// L'application rejoue les jours manquants à l'ouverture si le serveur a pris
// du retard : le résultat est identique, tout hasard partant de graines.

import {
  niveau, prestige, frequentationAnnualisee, statutAtteint, joursPourNouveaute,
} from './regles.js';
import {
  detailVisiteurs, satisfaction, reputationSuivante, espacesOuverts,
} from './visiteurs.js';
import { tirerCandidats, effetsPersonnel } from './personnel.js';
import { tirages, enquete } from './securite.js';
import { espace, contenuEspace, refusAccrochage } from './batiment.js';
import { positionJoueur, tableau } from './classement.js';
import { tirerArrivage, debloque } from './arrivages.js';
import { generateur, choixPondere, entier } from './alea.js';
import { jourSemaine } from './temps.js';
import { copie, evenement, creerEtat } from './etat.js';
import { sortirDuPublic, entrerDansLePublic } from './lieux.js';

const RETENTION_HISTORIQUE = 400;
const RETENTION_RAPPORTS = 30;

/** Ajoute un bonus de réputation immédiat et permanent. */
export function bonusReputation(cfg, etat, points) {
  etat.bonusPermanents = (etat.bonusPermanents || 0) + points;
  etat.reputation = Math.min(cfg.reputation.max, etat.reputation + points);
}

export { sortirDuPublic, entrerDansLePublic };

/**
 * Ramène une œuvre (fin de prêt ou d'exposition) à sa place d'origine si elle
 * est libre, sinon en réserve. La réserve peut alors déborder : rien ne se
 * perd, mais les acquisitions restent bloquées tant qu'elle est pleine.
 */
export function ramener(cfg, etat, id, jour) {
  const o = etat.oeuvres[id];
  if (!o) return;
  const r = o.retour || { lieu: 'reserve' };
  delete o.retour;
  if (r.lieu === 'espace' && espace(etat, r.espace)
    && contenuEspace(etat, r.espace)[r.place] === null
    && !refusAccrochage(cfg, etat, o, r.espace)) {
    o.lieu = 'espace';
    o.espace = r.espace;
    o.place = r.place;
    return;
  }
  delete o.espace;
  delete o.place;
  o.lieu = r.lieu === 'privee' ? 'privee' : 'reserve';
  sortirDuPublic(o, jour);
}

/** Ferme le jour `d` : visiteurs, satisfaction, réputation, statut, classement. */
export function fermerJour(cfg, etat, d, ctx) {
  const detail = detailVisiteurs(cfg, etat, d);
  const visiteurs = detail.total;

  const expo = etat.expositions?.courante;
  if (expo && d >= expo.debut && d < expo.fin) {
    expo.visiteurs += detail.parOeuvre
      .filter((a) => a.espace === 'exposition')
      .reduce((s, a) => s + a.visiteurs, 0);
  }

  // Seules les œuvres réellement vues vieillissent : une salle fermée faute
  // de gardien ne compte pas.
  const { ouverts } = espacesOuverts(cfg, etat, d);
  for (const o of Object.values(etat.oeuvres)) {
    if ((o.lieu === 'espace' && ouverts.has(o.espace)) || (o.lieu === 'exposition' && ouverts.has('exposition'))) {
      o.joursExpo = (o.joursExpo || 0) + 1;
    }
  }

  const sat = satisfaction(cfg, etat, visiteurs);
  etat.satisfaction = sat;
  etat.reputation = reputationSuivante(cfg, etat, sat);

  etat.historique.push({ jour: d, visiteurs, satisfaction: round1(sat), reputation: round1(etat.reputation) });
  if (etat.historique.length > RETENTION_HISTORIQUE) {
    etat.historique = etat.historique.slice(-RETENTION_HISTORIQUE);
  }
  const annualisee = frequentationAnnualisee(cfg, etat.historique);
  etat.historique[etat.historique.length - 1].annualisee = annualisee;

  const atteint = statutAtteint(cfg, annualisee);
  while (etat.statut < atteint) {
    etat.statut++;
    bonusReputation(cfg, etat, cfg.reputation.bonusStatut);
    evenement(etat, d + 1, 'statut', { statut: etat.statut });
  }

  if (ctx?.musees?.length) {
    const avant = etat.classement;
    const pos = positionJoueur(cfg, etat, ctx.musees, annualisee);
    if (avant) {
      const avantDevant = new Set(avant.devant);
      const apresDevant = new Set(pos.devant);
      const gagnes = avant.devant.filter((id) => !apresDevant.has(id));
      const perdus = pos.devant.filter((id) => !avantDevant.has(id));
      if (gagnes.length || perdus.length) {
        const nom = (id) => ctx.musees.find((m) => m.id === id)?.nom || '?';
        evenement(etat, d + 1, 'classement', {
          rang: pos.rang, avant: avant.rang,
          gagnes: gagnes.slice(0, 5).map(nom), perdus: perdus.slice(0, 5).map(nom),
        });
      }
    }
    etat.classement = { jour: d, annualisee, ...pos, precedent: avant?.rang ?? null };
  }
  etat.jourFerme = d;
}

/** Ouvre le jour `J` : tout ce qui arrive à 4 h. */
export async function ouvrirJour(cfg, etat, J, ctx) {
  const veille = etat.historique[etat.historique.length - 1] || null;
  const rapport = {
    jour: J,
    vu: false,
    veille,
    rang: etat.classement?.rang ?? null,
    rangPrecedent: etat.classement?.precedent ?? null,
    statut: etat.statut,
    faits: [],
  };
  for (const e of etat.evenements) {
    if (e.jour === J && (e.type === 'statut' || e.type === 'classement' || e.type === 'promotion')) rapport.faits.push({ ...e });
  }

  // Fins de prêt.
  const restants = [];
  for (const p of etat.prets.enCours) {
    if (p.fin > J) { restants.push(p); continue; }
    const o = etat.oeuvres[p.oeuvre];
    ramener(cfg, etat, p.oeuvre, J);
    if (o) {
      o.joursExpo = joursPourNouveaute(cfg, cfg.prets.nouveauteRetour);
      if (o.lieu === 'espace') o.sortieLe = null;
    }
    etat.prets.historique.push({ ...p, rendu: J });
    rapport.faits.push({ type: 'finPret', oeuvre: p.oeuvre, musee: p.museeNom, lieu: o?.lieu });
  }
  etat.prets.enCours = restants;

  // Demande de prêt sans réponse.
  const d = etat.prets.demande;
  if (d && d.expire <= J) {
    etat.prets.historique.push({ ...d, issue: 'expiree' });
    etat.prets.demande = null;
    rapport.faits.push({ type: 'pretExpire', oeuvre: d.oeuvre, musee: d.museeNom });
  }

  // Fin d'exposition temporaire.
  const x = etat.expositions.courante;
  if (x && x.fin <= J) {
    const bonus = Math.min(cfg.expositions.reputationMax, x.visiteurs / cfg.expositions.visiteursParPointReputation);
    bonusReputation(cfg, etat, bonus);
    for (const id of x.oeuvres) ramener(cfg, etat, id, J);
    etat.expositions.historique.push({
      id: x.id, theme: x.theme, debut: x.debut, fin: x.fin,
      visiteurs: Math.round(x.visiteurs), bonus: round1(bonus),
      oeuvres: x.oeuvres.length, emprunts: x.emprunts.length,
    });
    etat.expositions.derniereFin = J;
    etat.expositions.courante = null;
    evenement(etat, J, 'exposition', { visiteurs: Math.round(x.visiteurs), bonus: round1(bonus) });
    rapport.faits.push({ type: 'finExposition', visiteurs: Math.round(x.visiteurs), bonus: round1(bonus), theme: x.theme });
  }

  // Arrivages expirés, nouvel arrivage du lundi, alerte d'expiration.
  etat.arrivages = etat.arrivages.filter((a) => a.expire > J);
  if (jourSemaine(J) === cfg.arrivages.jourSemaine && ctx?.tirer
    && !etat.arrivages.some((a) => a.jour === J)) {
    const a = await tirerArrivage(cfg, etat, J, ctx.tirer);
    if (a.oeuvres.length) {
      etat.arrivages.push(a);
      evenement(etat, J, 'arrivage', { arrivage: a.id, nombre: a.oeuvres.length });
      rapport.faits.push({ type: 'arrivage', arrivage: a.id, nombre: a.oeuvres.length });
    }
  }
  // Candidats de la semaine, en même temps que l'arrivage.
  if (etat.personnel) {
    etat.personnel.candidats = etat.personnel.candidats.filter((c) => c.expire > J);
    if (jourSemaine(J) === cfg.arrivages.jourSemaine && !etat.personnel.candidats.some((c) => c.id.startsWith(`c${J}-`))) {
      const nouveaux = tirerCandidats(cfg, etat, J);
      etat.personnel.candidats.push(...nouveaux);
      rapport.faits.push({ type: 'candidats', nombre: nouveaux.length });
    }
  }

  // Sécurité : le tirage du dimanche, puis l'enquête sur les œuvres volées.
  if (etat.securite && jourSemaine(J) === cfg.securite.jourSemaine) {
    rapport.faits.push(...enquete(cfg, etat, J));
    rapport.faits.push(...tirages(cfg, etat, J));
  }

  const alerte = Math.ceil(cfg.arrivages.alerteExpirationH / 24);
  for (const a of etat.arrivages) {
    if (a.expire - J === alerte && a.oeuvres.some((o) => !o.achetee)) {
      evenement(etat, J, 'expiration', { arrivage: a.id });
    }
  }

  // Demandes de prêt : au plus une par semaine, le jour tiré le lundi.
  if (debloque(cfg, etat, 'prets')) {
    if (jourSemaine(J) === cfg.arrivages.jourSemaine) {
      const alea = generateur(`${etat.graine}:semainePret:${J}`);
      const p = cfg.prets.probabiliteHebdo + (effetsPersonnel(cfg, etat).regisseur?.probabilitePret || 0);
      etat.prets.prevue = alea() < p ? J + entier(7, alea) : null;
    }
    if (etat.prets.prevue === J && !etat.prets.demande) {
      const demande = demandePret(cfg, etat, J, ctx);
      if (demande) {
        etat.prets.demande = demande;
        evenement(etat, J, 'pret', { oeuvre: demande.oeuvre, musee: demande.museeNom });
        rapport.faits.push({ type: 'demandePret', oeuvre: demande.oeuvre, musee: demande.museeNom });
      }
      etat.prets.prevue = null;
    }
  }

  etat.rapports.push(rapport);
  if (etat.rapports.length > RETENTION_RAPPORTS) etat.rapports = etat.rapports.slice(-RETENTION_RAPPORTS);
}

/** Tire une demande de prêt : un musée voisin au classement, une œuvre au prorata du prestige. */
export function demandePret(cfg, etat, J, ctx) {
  const eligibles = Object.values(etat.oeuvres).filter((o) => o.lieu === 'espace');
  if (!eligibles.length || !ctx?.musees?.length) return null;
  const alea = generateur(`${etat.graine}:demande:${J}`);
  const oeuvre = choixPondere(eligibles.map((o) => [o, prestige(cfg, o.niveau)]), alea);
  const annualisee = etat.classement?.annualisee ?? frequentationAnnualisee(cfg, etat.historique);
  const lignes = tableau(cfg, etat, ctx.musees, annualisee);
  const iJ = lignes.findIndex((l) => l.joueur);
  const candidats = lignes.filter((l, i) => !l.joueur && Math.abs(i - iJ) <= cfg.prets.ecartRangs);
  if (!candidats.length) return null;
  const musee = candidats[entier(candidats.length, alea)];
  const duree = cfg.prets.durees[entier(cfg.prets.durees.length, alea)];
  return {
    id: `p${J}`,
    jour: J,
    expire: J + Math.ceil(cfg.prets.reponseH / 24),
    musee: musee.id,
    museeNom: musee.nom,
    oeuvre: oeuvre.id,
    niveau: oeuvre.niveau,
    duree,
    remuneration: Math.round(cfg.prets.remunerationHebdo * niveau(cfg, oeuvre.niveau).prix * duree / 7
      * (1 + (effetsPersonnel(cfg, etat).regisseur?.remuneration || 0))),
  };
}

/** Nouveau musée, avec son premier arrivage immédiat (la première œuvre offerte). */
export async function creerMusee(cfg, { nom, jour, graine }, ctx) {
  const etat = creerEtat(cfg, { nom, jour, graine });
  if (ctx?.tirer) {
    const a = await tirerArrivage(cfg, etat, jour, ctx.tirer, { premier: true });
    etat.arrivages.push(a);
  }
  // Premiers candidats tout de suite : la deuxième salle attend son gardien.
  etat.personnel.candidats = tirerCandidats(cfg, etat, jour);
  return etat;
}

/**
 * Rejoue tous les jours manquants jusqu'au jour courant `jourCourant`.
 * Ne modifie pas l'état reçu.
 */
export async function avancer(cfg, etat0, jourCourant, ctx) {
  const etat = copie(etat0);
  while (etat.jourFerme < jourCourant - 1) {
    const d = etat.jourFerme + 1;
    fermerJour(cfg, etat, d, ctx);
    await ouvrirJour(cfg, etat, d + 1, ctx);
  }
  return etat;
}

function round1(x) {
  return Math.round(x * 10) / 10;
}
