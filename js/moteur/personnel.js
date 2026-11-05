// Personnel (docs/ECONOMIE.md, section 2). Des personnes, pas des effectifs :
// un nom, un métier, un niveau qui monte avec les heures de session
// travaillées, un salaire qui suit le niveau et le rang du musée.

import { generateur, choixPondere, entier } from './alea.js';
import { PRENOMS, NOMS } from './noms.js';
import { entretienHoraire } from './batiment.js';

export function role(cfg, id) {
  return cfg.personnel.roles.find((r) => r.id === id) || null;
}

/** Métiers ouverts : le statut suffit, sauf pour ceux qui exigent un matériel. */
export function rolesOuverts(cfg, etat) {
  return cfg.personnel.roles.filter((r) => r.statutMin <= etat.statut && (!r.equipement || equipementPresent(etat, r.equipement)));
}

/** Un matériel est là : acheté pour tout le musée, ou installé dans au moins une salle. */
export function equipementPresent(etat, id) {
  return (etat.investissements || []).includes(id) || Object.values(etat.securite?.salles || {}).some((l) => l.includes(id));
}

/** Ce qui manque pour ouvrir un métier, ou null. */
export function refusRole(cfg, etat, r) {
  if (r.statutMin > etat.statut) return cfg.statuts[r.statutMin].nom;
  if (r.equipement && !equipementPresent(etat, r.equipement)) {
    return cfg.investissements.find((i) => i.id === r.equipement)?.nom || cfg.materielSalle?.find((m) => m.id === r.equipement)?.nom || r.equipement;
  }
  return null;
}

/** Minutes de travail correspondant au début d'un niveau. */
export function minutesPourNiveau(cfg, n) {
  return n <= 1 ? 0 : (cfg.personnel.experience[n - 2] ?? 0) * 60;
}

export function niveauEmploye(cfg, minutes) {
  let n = 1;
  cfg.personnel.experience.forEach((h, i) => { if (minutes >= h * 60) n = i + 2; });
  return Math.min(cfg.personnel.niveauMax, n);
}

/**
 * Salaire par heure de session : niveau, grille du statut, et prétention
 * propre à la personne (1 pour qui n'en a pas : employés d'avant les profils).
 */
export function salaireHoraire(cfg, etat, { role: r, niveau, salaire = 1 }) {
  const p = cfg.personnel;
  const base = role(cfg, r)?.base ?? 0;
  return base * p.progression ** (niveau - 1) * (p.grille[etat.statut] ?? p.grille[p.grille.length - 1]) * salaire;
}

/** Efficacité d'une personne : 1 pour un employé moyen de son niveau. */
export const efficacite = (p) => p?.efficacite ?? 1;

export function employes(etat, roleId = null) {
  const liste = etat.personnel?.employes || [];
  return roleId ? liste.filter((e) => e.role === roleId) : liste;
}

export function avecNiveaux(cfg, etat) {
  return employes(etat).map((e) => ({ ...e, niveau: niveauEmploye(cfg, e.minutes) }));
}

export function masseSalariale(cfg, etat) {
  return avecNiveaux(cfg, etat).reduce((s, e) => s + salaireHoraire(cfg, etat, e), 0);
}

/** Effets cumulés de l'équipe. Les métiers « uniques » ne comptent que leur meilleur. */
export function effetsPersonnel(cfg, etat) {
  const equipe = avecNiveaux(cfg, etat);
  const de = (id) => equipe.filter((e) => e.role === id);
  // Pour un métier « unique », le meilleur est le plus fort : niveau × efficacité.
  const force = (e) => e.niveau * efficacite(e);
  const meilleur = (id) => de(id).reduce((m, e) => (!m || force(e) > force(m) ? e : m), null);
  const r = (id) => role(cfg, id) || {};
  const e = {
    gardiens: de('gardien').length,
    menaces: { nuit: 0, jour: 0, vandalisme: 0 },
    technicien: 0,
    enquete: 0,
    satisfaction: 0,
    densite: 0,
    assistants: de('assistant').sort((a, b) => b.niveau - a.niveau || a.id.localeCompare(b.id)),
    communication: null,
    conservateur: 0,
    regisseur: null,
    commissaire: null,
    abattement: 0,
  };
  // Protection humaine, renforcée par le chef de la sécurité.
  const chef = meilleur('chefSecurite');
  const kChef = chef ? 1 + (r('chefSecurite').humainBase + r('chefSecurite').humainNiveau * chef.niveau) * efficacite(chef) : 1;
  for (const x of equipe) {
    for (const [m, v] of Object.entries(r(x.role).menaces || {})) e.menaces[m] += v * x.niveau * efficacite(x) * kChef;
  }
  const tech = meilleur('technicien');
  if (tech) e.technicien = (r('technicien').materielBase + r('technicien').materielNiveau * tech.niveau) * efficacite(tech);
  const med = r('mediateur');
  e.satisfaction = Math.min(med.plafondTotal ?? Infinity,
    de('mediateur').reduce((s, x) => s + (med.satisfactionBase + med.satisfactionNiveau * x.niveau) * efficacite(x), 0));
  const acc = r('accueil');
  e.densite = de('accueil').reduce((s, x) => s + (acc.densiteBase + acc.densiteNiveau * x.niveau) * efficacite(x), 0);

  const com = meilleur('communication');
  if (com) {
    const c = r('communication');
    e.communication = { remise: Math.min(0.9, (c.remiseBase + c.remiseNiveau * com.niveau) * efficacite(com)), jours: Math.floor(com.niveau / c.joursTousLes) };
  }
  const cons = meilleur('conservateur');
  if (cons) e.conservateur = cons.niveau >= 6 ? r('conservateur').oeuvresNiveau6 : r('conservateur').oeuvres;
  const reg = meilleur('regisseur');
  if (reg) {
    const g = r('regisseur');
    e.regisseur = {
      probabilitePret: g.probabilitePret,
      remuneration: (g.remunerationBase + g.remunerationNiveau * reg.niveau) * efficacite(reg),
      enquete: (g.enqueteBase + g.enqueteNiveau * reg.niveau) * efficacite(reg),
    };
    e.enquete += e.regisseur.enquete;
  }
  const comm = meilleur('commissaire');
  if (comm) {
    const c = r('commissaire');
    e.commissaire = {
      attrait: (c.attraitBase + c.attraitNiveau * comm.niveau) * efficacite(comm),
      remise: Math.min(0.9, (c.remiseBase + c.remiseNiveau * comm.niveau) * efficacite(comm)),
    };
  }
  const compta = meilleur('comptable');
  if (compta) {
    const c = r('comptable');
    e.abattement = Math.min(0.9, (c.abattementBase + c.abattementNiveau * compta.niveau) * efficacite(compta));
  }
  return e;
}

/** Part du travail du maître qu'un assistant apporte à son œuvre. */
export function partAssistant(cfg, niveau, eff = 1) {
  const r = role(cfg, 'assistant');
  return (r.partBase + r.partNiveau * niveau) * eff;
}

/** Texte court de l'effet d'un employé, pour la fiche et les candidats. */
export function effetTexte(cfg, { role: id, niveau }) {
  const r = role(cfg, id);
  const pc = (x) => `${Math.round(x * 100)} %`;
  const menaces = () => Object.entries(r.menaces || {})
    .map(([m, v]) => `${{ nuit: 'cambriolage', jour: 'vol en salle', vandalisme: 'vandalisme' }[m]} +${v * niveau}`).join(' · ');
  switch (id) {
    case 'gardien': return `Ouvre une salle · ${menaces()}`;
    case 'veilleur': case 'surete': case 'operateur': case 'maitreChien': case 'pilote': return menaces();
    case 'technicien': return `Matériel électronique +${pc(r.materielBase + r.materielNiveau * niveau)}`;
    case 'chefSecurite': return `Protection humaine +${pc(r.humainBase + r.humainNiveau * niveau)}`;
    case 'assistant': return `${pc(partAssistant(cfg, niveau))} de ton travail, jusqu'à ${pc(r.plafond)}`;
    case 'mediateur': return `Satisfaction +${(r.satisfactionBase + r.satisfactionNiveau * niveau).toLocaleString('fr-FR')}`;
    case 'accueil': return `Affluence +${pc(r.densiteBase + r.densiteNiveau * niveau)}`;
    case 'communication': return `Campagnes -${pc(Math.min(0.9, r.remiseBase + r.remiseNiveau * niveau))}${Math.floor(niveau / r.joursTousLes) ? `, +${Math.floor(niveau / r.joursTousLes)} j` : ''}`;
    case 'conservateur': return `Arrivages +${niveau >= 6 ? r.oeuvresNiveau6 : r.oeuvres}, dont une du plus haut niveau`;
    case 'regisseur': return `Prêts +${pc(r.remunerationBase + r.remunerationNiveau * niveau)} · enquêtes +${pc(r.enqueteBase + r.enqueteNiveau * niveau)}`;
    case 'commissaire': return `Expositions ×${(1 + r.attraitBase + r.attraitNiveau * niveau).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}, emprunts -${pc(Math.min(0.9, r.remiseBase + r.remiseNiveau * niveau))}`;
    case 'comptable': return `Impôt -${pc(Math.min(0.9, r.abattementBase + r.abattementNiveau * niveau))}`;
    default: return '';
  }
}

/* ---------- Recrutement ---------- */

function nomTire(alea) {
  return `${PRENOMS[entier(PRENOMS.length, alea)]} ${NOMS[entier(NOMS.length, alea)]}`;
}

/**
 * Profil d'une personne : efficacité et prétention salariale, tirées d'un
 * générateur à part pour ne rien changer aux noms déjà tirés.
 */
export function profil(cfg, graine) {
  const p = cfg.personnel.profil;
  if (!p) return {};
  const alea = generateur(`${graine}:profil`);
  const cloche = (alea() + alea()) / 2;
  const eff = p.efficaciteMin + (p.efficaciteMax - p.efficaciteMin) * cloche;
  const salaire = Math.min(p.salaireMax, Math.max(p.salaireMin, 1 + p.suit * (eff - 1) + p.ecart * (alea() - 0.5)));
  return { efficacite: Math.round(eff * 100) / 100, salaire: Math.round(salaire * 100) / 100 };
}

/** Une personne au niveau voulu, prête à embaucher. */
export function personne(cfg, { id, role: r, niveau, graine }) {
  const alea = generateur(`${graine}:nom`);
  return { id, nom: nomTire(alea), role: r, niveau, minutes: minutesPourNiveau(cfg, niveau), ...profil(cfg, graine) };
}

/** Candidats de la semaine : métiers ouverts, niveaux plafonnés par le statut. */
export function tirerCandidats(cfg, etat, jour) {
  const p = cfg.personnel;
  const alea = generateur(`${etat.graine}:candidats:${jour}`);
  const ouverts = rolesOuverts(cfg, etat);
  const max = p.niveauCandidatMax[etat.statut] ?? p.niveauMax;
  const candidats = [];
  for (let i = 0; i < p.candidatsParSemaine; i++) {
    const r = choixPondere(ouverts.map((x) => [x.id, x.poids]), alea);
    // Les niveaux modestes sont plus fréquents : le plus haut pèse 1, le
    // précédent 2, etc., comme pour les arrivages.
    const niveau = choixPondere(Array.from({ length: max }, (_, k) => [k + 1, max - k]), alea);
    candidats.push({ ...personne(cfg, { id: `c${jour}-${i}`, role: r, niveau, graine: `${etat.graine}:c${jour}-${i}` }), expire: jour + p.validiteCandidatsJours });
  }
  return candidats;
}

/**
 * Recrutement bloqué par les arriérés ? Un petit retard est toléré : la
 * première session d'un musée sans œuvre exposée laisse forcément le salaire
 * du gardien de départ impayé.
 */
export function arrieresBloquants(cfg, etat) {
  const a = etat.personnel?.arrieres || 0;
  return a > 0 && a > (masseSalariale(cfg, etat) + entretienHoraire(cfg, etat)) * (cfg.personnel.arrieresToleresHeures ?? 0);
}

/** Frais de recrutement : quelques heures du salaire actuel. */
export function fraisRecrutement(cfg, etat, candidat) {
  return Math.max(1, Math.round(salaireHoraire(cfg, etat, candidat) * cfg.personnel.fraisRecrutementHeures));
}
