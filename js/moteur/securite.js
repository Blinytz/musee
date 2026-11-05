// Sécurité (docs/ECONOMIE.md, section 3). Trois menaces, chacune avec son
// risque, sa protection et son tirage du dimanche à 4 h : le cambriolage de
// nuit, le vol en salle et le vandalisme. Le matériel et les métiers ne
// protègent chacun que contre certaines d'entre elles.

import { prestige, borner, niveau } from './regles.js';
import { effetsPersonnel, employes } from './personnel.js';
import { visiteursDuJour } from './visiteurs.js';
import { placesPubliques } from './batiment.js';
import { generateur, choixPondere } from './alea.js';
import { evenement } from './etat.js';
import { sortirDuPublic } from './lieux.js';

export const MENACES = ['nuit', 'jour', 'vandalisme'];

function salleForte(cfg, etat) {
  return (etat.investissements || []).some((id) => cfg.investissements.find((i) => i.id === id)?.effets?.salleForte);
}

/** Poids d'une œuvre dans le risque de cambriolage, selon son emplacement. */
function poidsNuit(cfg, etat, o) {
  const p = cfg.securite.poids;
  if (o.lieu === 'reserve') return salleForte(cfg, etat) ? p.reserveForte : p.reserve;
  return p[o.lieu] ?? 0;
}

const exposee = (o) => o.lieu === 'espace' || o.lieu === 'exposition';

/** Affluence : plus la foule est dense, plus un vol passe inaperçu. */
function affluence(cfg, etat, jour) {
  const m = cfg.securite.menaces.jour;
  const places = placesPubliques(etat);
  if (!places) return 0.5;
  const densite = visiteursDuJour(cfg, etat, jour ?? etat.jourFerme + 1) / places;
  return Math.min(m.affluenceMax, 0.5 + densite / m.densiteRef);
}

/** Ce qui attire chaque menace. */
export function risques(cfg, etat, jour) {
  const s = cfg.securite;
  const v = s.menaces.vandalisme;
  const emprunts = etat.expositions?.courante?.emprunts || [];
  const celebrite = (n) => prestige(cfg, n) ** v.exposant / v.diviseur;
  let nuit = 0;
  let enSalle = 0;
  let vandalisme = 0;
  for (const o of Object.values(etat.oeuvres)) {
    nuit += prestige(cfg, o.niveau) * poidsNuit(cfg, etat, o);
    if (exposee(o)) {
      enSalle += prestige(cfg, o.niveau) * (s.portabilite[o.support] ?? 1);
      vandalisme += celebrite(o.niveau);
    }
  }
  for (const em of emprunts) {
    nuit += prestige(cfg, em.niveau) * s.poids.exposition;
    enSalle += prestige(cfg, em.niveau) * (s.portabilite[em.support] ?? 1);
    vandalisme += celebrite(em.niveau);
  }
  return { nuit, jour: enSalle ? enSalle * affluence(cfg, etat, jour) : 0, vandalisme };
}

/**
 * Protection contre chaque menace. Le matériel électronique est renforcé par
 * le technicien ; un matériel qui « requiert » un métier ne donne que sa part
 * `sans` tant que personne ne le sert.
 */
export function protections(cfg, etat) {
  const ep = effetsPersonnel(cfg, etat);
  const p = { nuit: ep.menaces.nuit, jour: ep.menaces.jour, vandalisme: ep.menaces.vandalisme };
  for (const id of etat.investissements || []) {
    const inv = cfg.investissements.find((i) => i.id === id);
    const f = inv?.effets;
    if (!f) continue;
    let k = 1;
    if (f.electronique) k *= 1 + ep.technicien;
    if (f.requiert && !employes(etat, f.requiert).length) k *= f.sans ?? 0;
    for (const m of MENACES) if (f[m]) p[m] += f[m] * k;
  }
  return p;
}

/** Probabilité de chaque menace au prochain tirage. */
export function probabilites(cfg, etat, jour) {
  const r = risques(cfg, etat, jour);
  const s = protections(cfg, etat);
  const p = {};
  for (const m of MENACES) {
    const c = cfg.securite.menaces[m];
    p[m] = r[m] > 0 ? borner(c.base * r[m] / (s[m] + c.plancher), c.min, c.max) : 0;
  }
  return p;
}

/** Le pire des trois risques : c'est lui que regardent les prêteurs. */
export function risqueMaximal(cfg, etat, jour) {
  return Math.max(...Object.values(probabilites(cfg, etat, jour)));
}

/** Un musée prête-t-il une œuvre de ce niveau ? */
export function seuilEmprunt(cfg, niveau) {
  return cfg.securite.seuilsEmprunt?.[niveau] ?? null;
}

export function peutEmprunter(cfg, etat, niveau, jour) {
  const seuil = seuilEmprunt(cfg, niveau);
  return seuil === null || risqueMaximal(cfg, etat, jour) <= seuil;
}

/** Chance hebdomadaire de retrouver une œuvre volée. */
export function chanceEnquete(cfg, etat) {
  return Math.min(1, cfg.securite.enquete + effetsPersonnel(cfg, etat).enquete);
}

/* ---------- Tirages du dimanche ---------- */

function retirer(etat, o, J) {
  if (exposee(o)) sortirDuPublic(o, J);
  if (o.lieu === 'exposition') {
    const x = etat.expositions.courante;
    if (x) x.oeuvres = x.oeuvres.filter((id) => id !== o.id);
  }
  delete o.espace;
  delete o.place;
  delete o.retour;
}

/** Un incident fait baisser la réputation, et durablement la confiance. */
function perdreReputation(cfg, etat, m) {
  const c = cfg.securite.menaces[m];
  etat.reputation = Math.max(0, etat.reputation - c.reputation);
  etat.bonusPermanents = (etat.bonusPermanents || 0) - (c.confiance || 0);
}

function voler(cfg, etat, J, m, o, p) {
  retirer(etat, o, J);
  const taux = cfg.charges?.assurance?.indemnite || 0;
  if (taux) etat.indemnites = (etat.indemnites || 0) + Math.round(niveau(cfg, o.niveau).prix * taux);
  o.lieu = 'volee';
  o.voleeLe = J;
  perdreReputation(cfg, etat, m);
  etat.securite.historique.push({ type: m === 'nuit' ? 'vol' : 'volSalle', jour: J, oeuvre: o.id, titre: o.titre, niveau: o.niveau, probabilite: p });
  evenement(etat, J, m === 'nuit' ? 'cambriolage' : 'volSalle', { oeuvre: o.id, titre: o.titre });
  return { type: m === 'nuit' ? 'cambriolage' : 'volSalle', oeuvre: o.id, titre: o.titre };
}

/**
 * Les trois tirages de la semaine, dans l'ordre : cambriolage, vol en salle,
 * vandalisme. Chacun a sa graine ; l'œuvre visée l'est au prorata de ce qui
 * attire la menace.
 */
export function tirages(cfg, etat, J) {
  const s = cfg.securite;
  const faits = [];
  const ouSession = (o) => etat.session?.oeuvre !== o.id;

  for (const m of MENACES) {
    const alea = generateur(`${etat.graine}:${m}:${J}`);
    const p = probabilites(cfg, etat, J)[m];
    if (!(alea() < p)) continue;
    const oeuvres = Object.values(etat.oeuvres).filter(ouSession);
    if (m === 'nuit') {
      const o = choixPondere(oeuvres.map((x) => [x, prestige(cfg, x.niveau) * poidsNuit(cfg, etat, x)]), alea);
      if (o) faits.push(voler(cfg, etat, J, m, o, p));
    } else if (m === 'jour') {
      const o = choixPondere(oeuvres.filter(exposee).map((x) => [x, prestige(cfg, x.niveau) * (s.portabilite[x.support] ?? 1)]), alea);
      if (o) faits.push(voler(cfg, etat, J, m, o, p));
    } else {
      const v = s.menaces.vandalisme;
      const o = choixPondere(oeuvres.filter(exposee).map((x) => [x, prestige(cfg, x.niveau) ** v.exposant]), alea);
      if (!o) continue;
      // L'œuvre abîmée est décrochée : elle n'est plus exposable avant d'être
      // restaurée de nouveau.
      const degats = v.degatsMin + (v.degatsMax - v.degatsMin) * alea();
      retirer(etat, o, J);
      o.lieu = 'reserve';
      o.progression = Math.max(0, o.progression - degats);
      if (o.progression < 1) o.restaureeLe = null;
      perdreReputation(cfg, etat, m);
      etat.securite.historique.push({ type: 'vandalisme', jour: J, oeuvre: o.id, titre: o.titre, niveau: o.niveau, degats, probabilite: p });
      evenement(etat, J, 'vandalisme', { oeuvre: o.id, titre: o.titre, degats: Math.round(degats * 100) });
      faits.push({ type: 'vandalisme', oeuvre: o.id, titre: o.titre, degats: Math.round(degats * 100) });
    }
  }
  return faits;
}

/** Enquête hebdomadaire : retrouvée (abîmée), toujours cherchée, ou perdue. */
export function enquete(cfg, etat, J) {
  const s = cfg.securite;
  const faits = [];
  const chance = chanceEnquete(cfg, etat);
  for (const o of Object.values(etat.oeuvres)) {
    if (o.lieu !== 'volee') continue;
    const alea = generateur(`${etat.graine}:enquete:${o.id}:${J}`);
    if (alea() < chance) {
      o.lieu = 'reserve';
      delete o.voleeLe;
      o.progression = Math.max(0, o.progression - s.degats);
      if (o.progression < 1) o.restaureeLe = null;
      etat.securite.historique.push({ type: 'retrouvee', jour: J, oeuvre: o.id, titre: o.titre });
      evenement(etat, J, 'retrouvee', { oeuvre: o.id, titre: o.titre });
      faits.push({ type: 'retrouvee', oeuvre: o.id, titre: o.titre });
    } else if (J - o.voleeLe >= s.enqueteSemaines * 7) {
      etat.securite.historique.push({ type: 'perdue', jour: J, oeuvre: o.id, titre: o.titre, niveau: o.niveau });
      delete etat.oeuvres[o.id];
      evenement(etat, J, 'perdue', { oeuvre: o.id, titre: o.titre });
      faits.push({ type: 'perdue', oeuvre: o.id, titre: o.titre });
    }
  }
  return faits;
}
