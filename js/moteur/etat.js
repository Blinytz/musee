// État du joueur : création et migration. L'état est un document JSON unique,
// stocké dans Supabase (`musee_etats`) et rejoué à l'identique par
// l'application et par l'Edge Function quotidienne.

import { personne, tirerCandidats } from './personnel.js';

export const FORMAT = 4;

// Matériel autrefois commun à tout le musée, désormais installé dans une
// salle (format 4) : l'ancien identifiant, le nouveau, et où il va.
const MATERIEL_FORMAT_4 = {
  serrures: ['porte', 'public'], alarme: ['alarme', 'public'], video: ['cameras', 'public'],
  vitrines: ['vitrines', 'public'], securite1: ['norme1', 'public'], securite2: ['norme2', 'public'],
  salleForte: ['blindage', 'reserve'],
};

export function creerEtat(cfg, { nom, jour, graine }) {
  const d = cfg.depart;
  const salles = [];
  for (let i = 0; i < d.salles; i++) {
    salles.push({
      id: `s${i + 1}`,
      nom: `Salle ${i + 1}`,
      aile: 1,
      places: cfg.batiment.salle.places,
      agrandissements: 0,
      theme: null,
    });
  }
  return {
    format: FORMAT,
    nom,
    graine,
    creeLe: jour,
    // Dernier jour de jeu dont les visiteurs ont été comptés.
    jourFerme: jour - 1,
    reputation: d.reputation,
    bonusPermanents: 0,
    satisfaction: cfg.satisfaction.base,
    statut: 0,
    prixBillet: d.prixBillet,
    historique: [],
    maitrise: Object.fromEntries(cfg.supports.map((s) => [s.id, 0])),
    batiment: {
      ailes: d.ailes,
      salles,
      sallesAchetees: 0,
      reserve: { places: d.reserve, achats: 0 },
      privee: { places: d.privee, achats: 0 },
      cabinet: null,
      jardin: null,
      exposition: null,
    },
    investissements: [],
    oeuvres: {},
    arrivages: [],
    session: null,
    sessions: [],
    campagne: null,
    prets: { demande: null, enCours: [], prevue: null, historique: [] },
    personnel: {
      // L'équipe de départ est dans la moyenne : ni affaire, ni boulet.
      // Le gardien de départ tient la première salle.
      employes: (cfg.depart.personnel || []).map((p, i) => ({
        ...personne(cfg, { id: `e${jour}-d${i}`, role: p.role, niveau: p.niveau, graine: `${graine}:depart:${i}` }),
        efficacite: 1,
        salaire: 1,
        ...(p.role === 'gardien' ? { affectation: [salles[i]?.id || 's1'] } : {}),
      })),
      candidats: [],
      arrieres: 0,
    },
    securite: { historique: [], salles: {} },
    expositions: { courante: null, derniereFin: null, historique: [] },
    classement: null,
    rapports: [],
    evenements: [],
    eclats: [],
    reglages: {
      parametres: {},
      notifications: Object.fromEntries(cfg.notifications.map((n) => [n.id, true])),
      dureeSession: cfg.session.dureeDefautMin,
    },
  };
}

/**
 * Met un état ancien au format courant. Ne jette jamais de données : un champ
 * inconnu est conservé, un état illisible lève une erreur plutôt que d'être
 * remplacé par un état vide.
 */
export function migrer(etat, cfg = null) {
  if (!etat || typeof etat !== 'object' || !etat.batiment || !etat.oeuvres) {
    throw new Error('État du musée illisible');
  }
  if ((etat.format || 0) > FORMAT) throw new Error('État produit par une version plus récente');
  const e = { ...etat };
  if ((e.format || 1) < 2) {
    // Format 2 : personnel et sécurité. Les anciens investissements
    // « Médiateurs » et « Conservateur » deviennent des employés de niveau 3,
    // et le musée reçoit son gardien de départ.
    const anciens = e.investissements || [];
    const employes = [];
    const jour = e.jourFerme + 1;
    const ajouter = (role, niveau, i) => {
      const id = `e${jour}-m${i}`;
      const p = cfg ? personne(cfg, { id, role, niveau, graine: `${e.graine}:migration:${i}` }) : { id, nom: '?', role, minutes: 0 };
      const { niveau: _n, ...employe } = p;
      employes.push(employe);
    };
    ajouter('gardien', 1, 0);
    if (anciens.includes('mediateurs')) ajouter('mediateur', 3, 1);
    if (anciens.includes('conservateur')) ajouter('conservateur', 3, 2);
    e.investissements = anciens.filter((i) => i !== 'mediateurs' && i !== 'conservateur');
    e.personnel = e.personnel || { employes, candidats: [], arrieres: 0 };
    // Des candidats tout de suite, sans attendre le lundi.
    if (cfg && !e.personnel.candidats.length) e.personnel.candidats = tirerCandidats(cfg, e, jour);
    e.securite = e.securite || { historique: [] };
  }
  if ((e.format || 1) < 3) {
    // Format 3 : la sécurité se diversifie, l'agent de sécurité devient
    // veilleur de nuit.
    for (const x of e.personnel?.employes || []) if (x.role === 'securite') x.role = 'veilleur';
    if (e.personnel) e.personnel.candidats = (e.personnel.candidats || []).map((c) => (c.role === 'securite' ? { ...c, role: 'veilleur' } : c));
  }
  if ((e.format || 1) < 4) {
    // Format 4 : la sécurité se joue salle par salle. Le matériel acheté pour
    // tout le musée est installé dans la salle la plus précieuse (le blindage
    // dans la réserve), chaque gardien tient une salle, les autres agents
    // l'espace le plus précieux.
    const valeur = (id) => Object.values(e.oeuvres).filter((o) => o.lieu === 'espace' && o.espace === id)
      .reduce((s, o) => s + (cfg?.niveaux?.[o.niveau]?.prestige ?? 1), 0);
    const salles = (e.batiment?.salles || []).map((s) => s.id).sort((a, b) => valeur(b) - valeur(a));
    const precieuse = salles[0] || 's1';
    e.securite = { historique: [], ...(e.securite || {}), salles: { ...(e.securite?.salles || {}) } };
    const garde = [];
    for (const ancien of e.investissements || []) {
      const cible = MATERIEL_FORMAT_4[ancien];
      if (!cible) { garde.push(ancien); continue; }
      const lieu = cible[1] === 'reserve' ? 'reserve' : precieuse;
      e.securite.salles[lieu] = [...new Set([...(e.securite.salles[lieu] || []), cible[0]])];
    }
    e.investissements = garde;
    // L'enquêteur salarié devient un détective, engagé par mission.
    const enqueteurs = (e.personnel?.employes || []).filter((x) => x.role === 'enqueteur');
    if (enqueteurs.length) {
      e.detectives = e.detectives || { carnet: [], candidats: [] };
      for (const x of enqueteurs) e.detectives.carnet.push({ id: `d-${x.id}`, nom: x.nom, xp: 0, efficacite: x.efficacite ?? 1, salaire: x.salaire ?? 1 });
      e.personnel.employes = e.personnel.employes.filter((x) => x.role !== 'enqueteur');
    }
    let rang = 0;
    for (const x of e.personnel?.employes || []) {
      if (x.affectation) continue;
      if (x.role === 'gardien') x.affectation = [salles[rang++ % Math.max(1, salles.length)] || 's1'];
      else if (['veilleur', 'surete', 'operateur', 'maitreChien', 'pilote'].includes(x.role)) x.affectation = [precieuse];
    }
  }
  e.format = FORMAT;
  return e;
}

/** Copie profonde : les moteurs ne modifient jamais l'état reçu. */
export function copie(etat) {
  return typeof structuredClone === 'function' ? structuredClone(etat) : JSON.parse(JSON.stringify(etat));
}

/** Ajoute un événement à notifier (Web Push) et à afficher. */
export function evenement(etat, jour, type, donnees = {}) {
  const id = `${type}:${jour}:${etat.evenements.length}`;
  etat.evenements.push({ id, jour, type, ...donnees, notifie: false });
  // Rétention : seuls les événements récents servent encore.
  if (etat.evenements.length > 200) etat.evenements = etat.evenements.slice(-200);
}
