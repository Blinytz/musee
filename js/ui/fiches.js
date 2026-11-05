// Fiches détaillées du personnel, des métiers, du matériel et des menaces.
// Les cartes restent courtes ; un appui ouvre la fiche : à quoi ça sert, ce
// que ça change ici (calculé sur une copie de l'état avec les vrais
// moteurs, avant → après), ce que ça coûte, ce qu'il faut pour l'avoir.

import { h, icone, nombre, dateJour } from './dom.js';
import { feuille, portrait, confirmer, cartel } from './composants.js';
import {
  MENACES, risques, probabilites, chanceEnquete, risqueMusee, semaine, lieuxSecurises, materielDe,
  materielPossible, prixMateriel, affectation, affectationParDefaut,
} from '../moteur/securite.js';
import {
  detectivesLibres, chanceDetective, tarifDetective, forfait, niveauDetective, chancePolice, prime,
} from '../moteur/detectives.js';
import {
  role, refusRole, minutesPourNiveau, niveauEmploye, salaireHoraire, fraisRecrutement, efficacite,
  avecNiveaux, partAssistant, arrieresBloquants,
} from '../moteur/personnel.js';
import { visiteursDuJour, espacesOuverts, satisfaction, seuilDensite } from '../moteur/visiteurs.js';
import { placesPubliques } from '../moteur/batiment.js';
import { prestige } from '../moteur/regles.js';

/* ---------- Textes ---------- */

const ROLES = {
  gardien: 'Surveille une salle pendant les visites. Chaque salle ouverte au public demande un gardien : sans lui, elle reste fermée.',
  veilleur: 'Fait des rondes la nuit, musée fermé. Le premier rempart contre les cambrioleurs.',
  surete: 'Fouille les sacs aux portiques d\'entrée. Arrête surtout les vandales, et quelques voleurs.',
  operateur: 'Surveille les écrans de la vidéosurveillance, jour et nuit. Sans opérateur, les caméras ne donnent que la moitié de leur protection.',
  maitreChien: 'Patrouille la nuit avec son chien. Très dissuasif pour les cambrioleurs.',
  technicien: 'Règle et entretient le matériel électronique : alarme, caméras, portiques, drones. Tout ce matériel protège mieux.',
  chefSecurite: 'Dirige l\'équipe de sécurité : chaque gardien, veilleur ou agent protège davantage.',
  pilote: 'Fait voler les drones de surveillance la nuit. Sans pilote, les drones restent au sol.',
  assistant: 'Pendant tes sessions, restaure une autre œuvre de l\'atelier, à une fraction de ton rythme.',
  mediateur: 'Guide les visiteurs et anime les salles. Ils repartent plus satisfaits, et la réputation suit.',
  accueil: 'Accueille et oriente le public. Les salles supportent plus de monde avant que la foule ne gâche la visite.',
  communication: 'Monte les campagnes de publicité : elles coûtent moins cher, et durent plus longtemps aux niveaux élevés.',
  conservateur: 'Repère des œuvres pour la collection : chaque arrivage en propose davantage, dont une du plus haut niveau possible.',
  regisseur: 'Organise les prêts aux autres musées : plus de demandes, mieux payées. Aide aussi à retrouver les œuvres volées.',
  commissaire: 'Conçoit les expositions temporaires : elles attirent plus de visiteurs, et les emprunts coûtent moins cher.',
  comptable: 'Tient les comptes : l\'impôt prélevé sur le bénéfice des sessions baisse.',
};

const MATERIEL = {
  porte: 'Une porte blindée et des serrures renforcées. La première protection contre le vol.',
  alarme: 'Détecte toute intrusion dans la salle et prévient aussitôt.',
  cameras: 'Des caméras qui filment la salle jour et nuit.',
  vitrines: 'Les œuvres passent sous verre : on ne peut plus les toucher ni les emporter.',
  blindage: 'Une réserve blindée. Les œuvres qui y sont rangées n\'attirent presque plus les voleurs.',
  norme1: 'La norme exigée pour accrocher des Chefs-d\'œuvre dans cette salle.',
  norme2: 'La norme la plus haute, exigée pour accrocher des Trésors dans cette salle.',
  portiques: 'Des détecteurs à l\'entrée du musée : outils, bombes de peinture et objets dangereux restent dehors.',
  chenil: 'Loge les chiens de garde. Ne protège rien seul : il faut des maîtres-chiens.',
  pcSecurite: 'Une salle de contrôle qui réunit alarmes, caméras et rondes.',
  drones: 'Survolent le musée et repèrent les intrus de loin.',
};

const MENACE = {
  vol: {
    texte: 'Un voleur s\'en prend à une salle, à n\'importe quelle heure : la nuit par effraction, le jour sous un manteau. Il vise ce qui a le plus de valeur ; une salle bondée l\'aide, et estampes et photographies partent le plus vite.',
    suite: 'Une œuvre volée, et la réputation baisse. L\'assurance en rembourse une part, la police enquête 26 semaines.',
  },
  vandalisme: {
    texte: 'Un visiteur s\'en prend à une œuvre exposée. Les plus célèbres attirent les vandales ; une œuvre modeste ne risque presque rien.',
    suite: 'L\'œuvre est abîmée et décrochée : elle part en réparation à l\'atelier.',
  },
};

const NOMS_MENACES = { vol: 'vol', vandalisme: 'vandalisme' };

/* ---------- Mesures ---------- */

const pct = (p) => `${(p * 100).toLocaleString('fr-FR', { maximumFractionDigits: p < 0.1 ? 1 : 0 })} %`;
const decimale = (x) => x.toLocaleString('fr-FR', { maximumFractionDigits: x < 10 ? 1 : 0 });

// Ce que l'on compare avant et après. `mieux` : +1 si plus est mieux.
const INDICATEURS = [
  { id: 'vol', nom: 'Vol', format: (v) => `${pct(v)} / sem.`, mieux: -1 },
  { id: 'vandalisme', nom: 'Vandalisme', format: (v) => `${pct(v)} / sem.`, mieux: -1 },
  { id: 'salles', nom: 'Salles ouvertes', format: (v) => nombre(v), mieux: 1 },
  { id: 'visiteurs', nom: 'Visiteurs par jour', format: (v) => nombre(v), mieux: 1 },
  { id: 'satisfaction', nom: 'Satisfaction', format: (v) => decimale(v), mieux: 1 },
  { id: 'foule', nom: 'Foule supportée', format: (v) => `${nombre(v)} visiteurs`, mieux: 1 },
  { id: 'enquete', nom: 'Œuvre volée retrouvée', format: (v) => `${pct(v)} / sem.`, mieux: 1 },
];

/** Les indicateurs d'un état, calculés par les moteurs du jeu. */
function mesurer(cfg, etat, jour) {
  const v = visiteursDuJour(cfg, etat, jour);
  return {
    ...risqueMusee(cfg, etat, jour),
    salles: espacesOuverts(cfg, etat, jour).ouverts.size,
    visiteurs: v,
    satisfaction: satisfaction(cfg, etat, v),
    foule: Math.round(seuilDensite(cfg, etat) * placesPubliques(etat)),
    enquete: chanceEnquete(cfg, etat),
  };
}

/** Avant → après d'une modification de l'état (copie), lignes qui changent. */
function ecarts(app, modifier) {
  const { jeu } = app;
  const jour = jeu.jour();
  const avant = mesurer(jeu.cfg, jeu.etat, jour);
  const copie = structuredClone(jeu.etat);
  modifier(copie);
  const apres = mesurer(jeu.cfg, copie, jour);
  return INDICATEURS.filter((x) => Math.abs(apres[x.id] - avant[x.id]) > Math.max(1e-4, Math.abs(avant[x.id]) * 0.005))
    .map((x) => ({ ...x, avant: avant[x.id], apres: apres[x.id], gain: Math.sign(apres[x.id] - avant[x.id]) * x.mieux }));
}

const depart = (id) => (etat) => { etat.personnel.employes = etat.personnel.employes.filter((e) => e.id !== id); };
const achat = (id) => (etat) => { etat.investissements = [...(etat.investissements || []), id]; };
const retrait = (id) => (etat) => { etat.investissements = (etat.investissements || []).filter((x) => x !== id); };

/** Un candidat ou un employé à un niveau donné, prêt à être ajouté à une copie. */
function aNiveau(cfg, p, niveau) {
  return (etat) => {
    etat.personnel.employes = etat.personnel.employes.filter((e) => e.id !== p.id);
    const x = {
      id: p.id || '__essai', nom: p.nom, role: p.role, minutes: minutesPourNiveau(cfg, niveau), efficacite: p.efficacite, salaire: p.salaire,
    };
    // Un agent de sécurité prend son poste à l'embauche, comme dans le jeu.
    if (role(cfg, p.role)?.menaces) x.affectation = p.affectation || affectationParDefaut(cfg, etat, x);
    etat.personnel.employes.push(x);
  };
}

const installe = (lieu, id) => (etat) => {
  etat.securite.salles = { ...(etat.securite.salles || {}), [lieu]: [...materielDe(etat, lieu), id] };
};
const desinstalle = (lieu, id) => (etat) => {
  etat.securite.salles = { ...(etat.securite.salles || {}), [lieu]: materielDe(etat, lieu).filter((x) => x !== id) };
};

// « 1,4 % / sem. » → « 1,4 % », puis sans unité pour le côté gauche.
const sansSemaine = (t) => t.replace(/ \/ sem\.$/, '');
const sansUnite = (t) => sansSemaine(t).replace(/\s[^\d\s].*$/, '');

/** Une ligne par indicateur qui change : nom, avant → après. */
function lignesEcarts(liste) {
  return liste.map((x) => h('div.fiche-ecart', { classe: x.gain > 0 ? 'mieux' : 'pire' },
    h('span', x.nom),
    h('span.nombre', `${sansSemaine(x.format(x.avant))} → `, h('b', x.format(x.apres)))));
}


/** L'écart favorable le plus parlant : « Cambriolage 1,4 → 0,6 % ». */
function court(liste) {
  const bons = liste.filter((x) => x.gain > 0);
  if (!bons.length) return null;
  const relatif = (x) => Math.abs(x.apres - x.avant) / (Math.abs(x.avant) || 1);
  const x = bons.sort((a, b) => relatif(b) - relatif(a))[0];
  return `${x.nom} ${sansUnite(x.format(x.avant))} → ${sansSemaine(x.format(x.apres))}`;
}

// Pour ce qui est déjà là, on montre son apport : sans lui → avec lui.
const inverse = (x) => ({ ...x, avant: x.apres, apres: x.avant, gain: -x.gain });

/** Effet d'un achat de matériel, en une ligne de carte. */
export function resumeMateriel(app, x) {
  const id = x.id.replace(/^inv:/, '');
  return court(x.acquis ? ecarts(app, retrait(id)).map(inverse) : ecarts(app, achat(id)));
}

/** Ce qu'apporte une personne, en une ligne de carte. */
export function resumePersonne(app, p, { candidat = false } = {}) {
  const cfg = app.jeu.cfg;
  const niveau = candidat ? p.niveau : niveauEmploye(cfg, p.minutes);
  const liste = candidat ? ecarts(app, modifs.embauche(cfg, p)) : ecarts(app, depart(p.id)).map(inverse);
  return court(liste) || effetsPropres(cfg, p.role, niveau, efficacite(p)).find(Boolean) || null;
}

/** À quoi sert un métier, en une phrase. */
export function resumeMetier(id) {
  return (ROLES[id] || '').split(/(?<=\.) /)[0];
}

export const modifs = { embauche: (cfg, c) => aNiveau(cfg, { ...c, id: '__essai' }, c.niveau), depart, achat, retrait };

/* ---------- Effets propres à un métier ---------- */

/** Ce que les indicateurs ne montrent pas : travail, campagnes, arrivages… */
function effetsPropres(cfg, id, niveau, eff = 1) {
  const r = role(cfg, id) || {};
  const p = (x) => `${Math.round(x * 100)} %`;
  const k = (base, parNiveau) => (base + parNiveau * niveau) * eff;
  switch (id) {
    case 'assistant': return [`Avance une autre œuvre à ${p(partAssistant(cfg, niveau, eff))} de ton rythme`, `Tous assistants réunis : ${p(r.plafond)} au plus`];
    case 'communication': {
      const j = Math.floor(niveau / r.joursTousLes);
      return [`Campagnes ${p(Math.min(0.9, k(r.remiseBase, r.remiseNiveau)))} moins chères`, j ? `Campagnes prolongées de ${j} j` : null];
    }
    case 'conservateur': return [`Arrivages : ${niveau >= 6 ? r.oeuvresNiveau6 : r.oeuvres} œuvre${(niveau >= 6 ? r.oeuvresNiveau6 : r.oeuvres) > 1 ? 's' : ''} de plus chaque lundi`];
    case 'regisseur': return [`Demandes de prêt : +${p(r.probabilitePret)} de chances chaque semaine`, `Prêts payés ${p(k(r.remunerationBase, r.remunerationNiveau))} de plus`];
    case 'commissaire': return [`Expositions : ${p(k(r.attraitBase, r.attraitNiveau))} de visiteurs en plus`, `Emprunts ${p(Math.min(0.9, k(r.remiseBase, r.remiseNiveau)))} moins chers`];
    case 'comptable': return [`Impôt ${p(Math.min(0.9, k(r.abattementBase, r.abattementNiveau)))} plus bas`];
    case 'technicien': return [`Matériel électronique ${p(k(r.materielBase, r.materielNiveau))} plus efficace`];
    case 'chefSecurite': return [`Protection de toute l'équipe +${p(k(r.humainBase, r.humainNiveau))}`];
    default: return [];
  }
}

/* ---------- Profils ---------- */

/**
 * Ce qui distingue une personne des autres du même niveau, en deux mots au
 * plus : son efficacité, et ce qu'elle coûte pour ce qu'elle rend.
 */
export function profilCourt(p) {
  if (p?.efficacite === undefined) return [];
  const eff = efficacite(p);
  const rapport = eff / (p.salaire ?? 1);
  const mots = [];
  if (eff >= 1.12) mots.push({ texte: 'Très efficace', bon: true });
  else if (eff >= 1.05) mots.push({ texte: 'Efficace', bon: true });
  else if (eff <= 0.88) mots.push({ texte: 'Peu efficace', bon: false });
  if (rapport >= 1.12) mots.push({ texte: 'Bonne affaire', bon: true });
  else if (rapport <= 0.89) mots.push({ texte: 'Salaire élevé', bon: false });
  return mots;
}

/** Les lignes du profil, pour la fiche. */
function lignesProfil(p) {
  if (p?.efficacite === undefined) return [];
  const ecart = Math.round(((p.salaire ?? 1) - 1) * 100);
  return [
    ligne(`Efficacité : ${Math.round(efficacite(p) * 100)} % de la moyenne du métier à ce niveau`),
    ligne(ecart === 0 ? 'Salaire demandé : celui de la grille' : `Salaire demandé : ${Math.abs(ecart)} % ${ecart > 0 ? 'au-dessus' : 'au-dessous'} de la grille`),
    profilCourt(p).length ? h('div.ligne', { style: { gap: '6px' } }, profilCourt(p).map((m) => h('span.puce', { classe: m.bon ? 'bon' : 'mauvais' }, m.texte))) : null,
  ];
}

/** Ce qu'apporte chaque niveau, en clair, pour la fiche d'un métier. */
function parNiveau(cfg, r) {
  const l = [];
  if (r.menaces) {
    l.push(`Protège contre : ${Object.keys(r.menaces).map((m) => NOMS_MENACES[m]).join(', ')}, un peu plus à chaque niveau`);
    l.push('Couvre une à trois salles ; sa protection s\'y partage');
  }
  if (r.unique) l.push('Un seul compte : le meilleur de l\'équipe');
  if (r.id === 'gardien') l.push('Un gardien par salle ouverte');
  return l;
}

/* ---------- Fiches ---------- */

function bloc(titre, ...contenu) {
  const enfants = contenu.flat().filter(Boolean);
  if (!enfants.length) return null;
  return h('div.fiche-bloc', titre ? h('div.fiche-legende', titre) : null, enfants);
}

const ligne = (texte) => (texte ? h('div.fiche-ligne', texte) : null);

/**
 * Fiche d'une personne : employé (`employe`) ou candidat (`candidat`).
 * Montre son métier, ce qu'elle change ici, son coût, sa progression.
 */
export function fichePersonne(app, p, { candidat = false } = {}) {
  const { jeu } = app;
  const cfg = jeu.cfg;
  const e = jeu.etat;
  const r = role(cfg, p.role);
  const niveau = candidat ? p.niveau : niveauEmploye(cfg, p.minutes);
  const salaire = salaireHoraire(cfg, e, { role: p.role, niveau, salaire: p.salaire });
  const apport = candidat
    ? ecarts(app, modifs.embauche(cfg, p))
    : ecarts(app, depart(p.id)).map(inverse);
  const suivant = niveau < cfg.personnel.niveauMax ? niveau + 1 : null;
  const auSuivant = !candidat && suivant ? ecarts(app, aNiveau(cfg, p, suivant)) : [];
  const resteH = suivant ? Math.max(0, Math.ceil((minutesPourNiveau(cfg, suivant) - p.minutes) / 60)) : 0;
  const doublon = r?.unique && avecNiveaux(cfg, e).some((x) => x.role === p.role && x.id !== p.id && x.niveau * efficacite(x) >= niveau * efficacite(p));

  let f = null;
  const actions = candidat
    ? h('button.bouton.or.plein', {
      type: 'button', disabled: arrieresBloquants(cfg, e) || (app.solde !== null && app.solde < fraisRecrutement(cfg, e, p)),
      onclick: async () => {
        f.fermer();
        await app.agir('embaucher', { candidat: p.id }, { succes: `${p.nom} rejoint l'équipe` });
      },
    }, arrieresBloquants(cfg, e) ? 'Salaires en retard' : `Embaucher · ${nombre(fraisRecrutement(cfg, e, p))} ✦`)
    : h('button.bouton.danger.plein', {
      type: 'button',
      onclick: async () => {
        if (!(await confirmer(`Licencier ${p.nom} ?`, { oui: 'Licencier', danger: true }))) return;
        f.fermer();
        await app.agir('licencier', { employe: p.id });
      },
    }, 'Licencier');

  f = feuille({
    titre: p.nom,
    contenu: h('div.fiche',
      h('div.fiche-tete', portrait(p.nom, 'grand'), h('div',
        h('b', r?.nom || p.role),
        h('div.tres-discret', `Niveau ${niveau}${candidat ? '' : ` · ${Math.floor(p.minutes / 60)} h de sessions`}`))),
      h('p.fiche-texte', ROLES[p.role] || ''),
      bloc('Profil', lignesProfil(p)),
      !candidat && r?.menaces ? blocAffectation(app, p, () => f) : null,
      bloc(candidat ? 'Si tu l\'embauches' : 'Son apport, sans → avec',
        lignesEcarts(apport),
        effetsPropres(cfg, p.role, niveau, efficacite(p)).map(ligne),
        doublon ? ligne('Un autre membre de l\'équipe fait déjà mieux : sans effet tant qu\'il reste') : null,
        !apport.length && !effetsPropres(cfg, p.role, niveau, efficacite(p)).length && !doublon ? ligne('Aucun effet mesurable aujourd\'hui') : null),
      bloc('Coût',
        candidat ? ligne(`Embauche : ${nombre(fraisRecrutement(cfg, e, p))} ✦, une fois`) : null,
        ligne(`Salaire : ${decimale(salaire)} ✦ par heure de session, prélevé à la fin de chaque session, arrondi à l'Éclat près`)),
      !candidat && suivant ? bloc(`Niveau ${suivant} dans ${resteH} h de sessions`,
        lignesEcarts(auSuivant),
        ligne(`Salaire : ${decimale(salaireHoraire(cfg, e, { role: p.role, niveau: suivant, salaire: p.salaire }))} ✦ par heure`)) : null,
      bloc(null, parNiveau(cfg, r || {}).map(ligne))),
    actions: h('div', { style: { marginTop: '14px' } }, actions),
  });
  return f;
}

/**
 * Les salles qu'un agent couvre : un appui en ajoute ou en retire une, trois
 * au plus. Chaque salle montre son risque de vol de la semaine.
 */
function blocAffectation(app, p, feuilleCourante) {
  const { jeu } = app;
  const cfg = jeu.cfg;
  const e = jeu.etat;
  const p7 = probabilites(cfg, e, jeu.jour());
  const choisies = new Set(affectation(p));
  const max = cfg.securite.sallesParAgent;
  return bloc(`Salles couvertes · ${choisies.size} / ${max}`,
    h('div.affectations', lieuxSecurises(cfg, e).map((l) => {
      const dedans = choisies.has(l.id);
      return h('button.puce', {
        type: 'button', classe: dedans ? 'actif' : '', disabled: !dedans && choisies.size >= max,
        onclick: async () => {
          const lieux = dedans ? [...choisies].filter((x) => x !== l.id) : [...choisies, l.id];
          feuilleCourante()?.fermer();
          const ok = await app.agir('affecter', { employe: p.id, lieux });
          if (ok) fichePersonne(app, app.jeu.etat.personnel.employes.find((x) => x.id === p.id) || p);
        },
      }, l.nom, h('small', pct(semaine(p7[l.id]?.vol || 0))));
    })));
}

/** Fiche d'un métier : ce qu'il fait, ce qu'il faut pour l'ouvrir, son salaire. */
export function ficheMetier(app, r) {
  const { jeu } = app;
  const cfg = jeu.cfg;
  const e = jeu.etat;
  const refus = refusRole(cfg, e, r);
  const membres = avecNiveaux(cfg, e).filter((x) => x.role === r.id);
  const candidats = (e.personnel?.candidats || []).filter((c) => c.role === r.id && c.expire > jeu.jour());
  const mat = r.equipement ? (cfg.investissements.find((i) => i.id === r.equipement) || cfg.materielSalle.find((m) => m.id === r.equipement)) : null;
  feuille({
    titre: r.nom,
    contenu: h('div.fiche',
      h('p.fiche-texte', ROLES[r.id] || ''),
      bloc('Ce qu\'apporte un employé de niveau 1', effetsPropres(cfg, r.id, 1).map(ligne), parNiveau(cfg, r).map(ligne)),
      bloc('Pour l\'ouvrir',
        r.statutMin ? ligne(`Statut ${cfg.statuts[r.statutMin].nom}${r.statutMin <= e.statut ? ' : atteint' : ''}`) : null,
        mat ? ligne(`Matériel : ${mat.nom}${refus ? '' : ' : acquis'}`) : null,
        !r.statutMin && !mat ? ligne('Ouvert dès le départ') : null),
      bloc('Salaire', ligne(`${decimale(salaireHoraire(cfg, e, { role: r.id, niveau: 1 }))} ✦ par heure de session au niveau 1, ${decimale(salaireHoraire(cfg, e, { role: r.id, niveau: cfg.personnel.niveauMax }))} ✦ au niveau ${cfg.personnel.niveauMax}`)),
      bloc('Ici',
        ligne(membres.length ? `${membres.length} dans l'équipe` : 'Personne dans l\'équipe'),
        ligne(refus ? `Fermé : ${refus}` : (candidats.length ? `${candidats.length} candidat${candidats.length > 1 ? 's' : ''} cette semaine` : 'Pas de candidat cette semaine, nouveaux candidats lundi')))),
  });
}

/** Fiche d'un matériel de sécurité. `x` : ligne du catalogue d'investissements. */
export function ficheMateriel(app, x) {
  const { jeu } = app;
  const cfg = jeu.cfg;
  const e = jeu.etat;
  const id = x.id.replace(/^inv:/, '');
  const f0 = x.effets || {};
  const noms = NOMS_MENACES;
  const apport = x.acquis
    ? ecarts(app, retrait(id)).map(inverse)
    : ecarts(app, achat(id));
  const metier = cfg.personnel.roles.find((r) => r.equipement === id);
  const servant = f0.requiert ? role(cfg, f0.requiert) : null;
  let f = null;
  f = feuille({
    titre: x.nom,
    contenu: h('div.fiche',
      h('p.fiche-texte', MATERIEL[id] || ''),
      bloc(x.acquis ? 'Son apport, sans → avec' : 'Si tu l\'achètes',
        lignesEcarts(apport),
        !apport.length ? ligne(metier && !MENACES.some((m) => f0[m]) ? 'Ne protège rien seul' : 'Aucun effet mesurable aujourd\'hui') : null),
      bloc('Ce qu\'il fait',
        MENACES.some((m) => f0[m]) ? ligne(`Protège contre : ${MENACES.filter((m) => f0[m]).map((m) => noms[m]).join(', ')}`) : null,
        MENACES.some((m) => f0[m]) ? ligne('Pour tout le musée') : null,
        f0.electronique ? ligne('Électronique : plus efficace avec un technicien de sécurité') : null,
        servant ? ligne(f0.sans ? `${Math.round(f0.sans * 100)} % de sa protection sans ${servant.nom.toLowerCase()}` : `Inutile sans ${servant.nom.toLowerCase()}`) : null,
        metier ? h('button.fiche-lien', { type: 'button', onclick: () => { f.fermer(); ficheMetier(app, metier); } }, `Ouvre le métier : ${metier.nom}`, icone('droite')) : null),
      bloc('Prix', ligne(x.acquis ? 'Acquis' : `${nombre(x.prix)} ✦, une fois`), x.refus && !x.acquis ? ligne(disponibilite(cfg, x)) : null)),
    actions: x.acquis ? null : h('button.bouton.or.plein', {
      type: 'button', style: { marginTop: '14px' }, disabled: !!x.refus || (app.solde !== null && app.solde < x.prix),
      onclick: async () => {
        if (!(await confirmer(x.nom, { texte: `${nombre(x.prix)} ✦`, oui: 'Acheter' }))) return;
        f.fermer();
        await app.agir('investir', { quoi: x.id }, { succes: x.nom });
      },
    }, x.refus || `Acheter · ${nombre(x.prix)} ✦`),
  });
}

/** Pourquoi un matériel n'est pas encore à vendre, en clair. */
function disponibilite(cfg, x) {
  const inv = cfg.investissements.find((i) => `inv:${i.id}` === x.id);
  if (inv?.statutMin && cfg.statuts[inv.statutMin]?.nom === x.refus) return `Disponible au statut ${x.refus}`;
  if (inv?.prerequis) return `Demande d'abord : ${x.refus}`;
  return x.refus;
}

/* ---------- Menaces ---------- */

/** Niveau de risque en un mot, et sa couleur. */
export function niveauRisque(p) {
  if (p < 0.01) return { mot: 'Faible', couleur: 'var(--vert)' };
  if (p < 0.04) return { mot: 'Modéré', couleur: 'var(--or)' };
  return { mot: 'Élevé', couleur: 'var(--rouge)' };
}

/** Risque d'un espace sur la semaine : vol ou vandalisme. */
export function risqueSalle(p7, lieu) {
  const x = p7[lieu] || { vol: 0, vandalisme: 0 };
  return 1 - ((1 - x.vol) * (1 - x.vandalisme)) ** 7;
}

/** Les œuvres d'un espace que la menace vise le plus, avec leur part du risque. */
function cibles(app, m, lieu) {
  const { jeu } = app;
  const cfg = jeu.cfg;
  const e = jeu.etat;
  const s = cfg.securite;
  const ici = (o) => (o.lieu === 'espace' ? o.espace : o.lieu) === lieu;
  const poids = (o) => (m === 'vol' ? prestige(cfg, o.niveau) * (s.portabilite[o.support] ?? 1)
    : prestige(cfg, o.niveau) ** s.menaces.vandalisme.exposant);
  const liste = Object.values(e.oeuvres).filter(ici).map((o) => [o, poids(o)]).filter(([, w]) => w > 0);
  const total = liste.reduce((t, [, w]) => t + w, 0);
  return liste.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([o, w]) => ({ o, part: w / total }));
}

/** Fiche d'une menace pour tout le musée : ce qu'elle fait, et les salles les plus exposées. */
export function ficheMenace(app, m) {
  const { jeu } = app;
  const cfg = jeu.cfg;
  const e = jeu.etat;
  const jour = jeu.jour();
  const total = risqueMusee(cfg, e, jour)[m];
  const n = niveauRisque(total);
  const p7 = probabilites(cfg, e, jour);
  const salles = lieuxSecurises(cfg, e).map((l) => ({ l, q: semaine(p7[l.id]?.[m] || 0) })).filter((x) => x.q > 0).sort((a, b) => b.q - a.q);
  let f = null;
  f = feuille({
    titre: cfg.securite.menaces[m].nom,
    contenu: h('div.fiche',
      h('div.fiche-risque', h('b', { style: { color: n.couleur } }, pct(total)), h('span', `par semaine pour tout le musée · ${n.mot.toLowerCase()}`)),
      h('p.fiche-texte', MENACE[m].texte),
      bloc('Si ça arrive', ligne(MENACE[m].suite), ligne('Un tirage par salle, chaque jour')),
      bloc('Les salles les plus exposées',
        salles.length ? salles.slice(0, 6).map(({ l, q }) => h('button.fiche-lien', { type: 'button', onclick: () => { f.fermer(); ficheSalle(app, l.id); } },
          h('span', h('b', l.nom)), h('span.nombre', { style: { color: niveauRisque(q).couleur } }, pct(q)), icone('droite')))
          : ligne('Rien à voler ici pour l\'instant'))),
  });
}

/**
 * Fiche d'un espace : son risque, ce qui l'attire, ce qui le protège, le
 * matériel qu'on peut y installer (avec son effet avant → après) et les
 * agents qui le couvrent.
 */
export function ficheSalle(app, lieu) {
  const { jeu } = app;
  const cfg = jeu.cfg;
  const e = jeu.etat;
  const jour = jeu.jour();
  const l = lieuxSecurises(cfg, e).find((x) => x.id === lieu);
  if (!l) return;
  const p7 = probabilites(cfg, e, jour);
  const q = risqueSalle(p7, lieu);
  const n = niveauRisque(q);
  const risqueApres = (modifier) => { const c = structuredClone(e); modifier(c); return risqueSalle(probabilites(cfg, c, jour), lieu); };
  const agents = avecNiveaux(cfg, e).filter((x) => affectation(x).includes(lieu));
  const installes = materielDe(e, lieu);
  const possibles = cfg.materielSalle.filter((m) => materielPossible(m, l.type) && !installes.includes(m.id));
  let f = null;
  const ligneMateriel = (m) => {
    const prix = prixMateriel(m, l);
    const refus = m.statutMin && e.statut < m.statutMin ? `Statut ${cfg.statuts[m.statutMin].nom}`
      : m.prerequis && !installes.includes(m.prerequis) ? `D'abord : ${cfg.materielSalle.find((x) => x.id === m.prerequis)?.nom}` : null;
    const apres = refus ? null : risqueApres(installe(lieu, m.id));
    return h('div.materiel-ligne',
      h('div', h('b', m.nom), h('small', refus || [apres !== null && apres < q - 1e-6 ? `→ ${pct(apres)} / sem.` : null, m.norme ? (m.norme === 1 ? 'Chefs-d\'œuvre accrochables' : 'Trésors accrochables') : null, m.blindage ? 'Réserve presque plus visée' : null].filter(Boolean).join(' · ') || MATERIEL[m.id])),
      h('button.bouton.petit.or', {
        type: 'button', disabled: !!refus || (app.solde !== null && app.solde < prix),
        onclick: async () => {
          if (!(await confirmer(`${m.nom} · ${l.nom}`, { texte: `${nombre(prix)} ✦`, oui: 'Installer' }))) return;
          f.fermer();
          const ok = await app.agir('installer', { lieu, materiel: m.id }, { succes: m.nom });
          if (ok) ficheSalle(app, lieu);
        },
      }, `${nombre(prix)} ✦`));
  };
  f = feuille({
    titre: l.nom,
    contenu: h('div.fiche',
      h('div.fiche-risque', h('b', { style: { color: n.couleur } }, pct(q)), h('span', `de vol ou de vandalisme par semaine · ${n.mot.toLowerCase()}`)),
      bloc('Ce qui attire',
        MENACES.flatMap((m) => cibles(app, m, lieu).map(({ o, part }) => h('div.fiche-ecart', h('span', `${cartel(app, o, null).titre}`), h('span.nombre', `${NOMS_MENACES[m]} ${Math.round(part * 100)} %`))))
          .slice(0, 4),
        risques(cfg, e, jour)[lieu]?.vol ? null : ligne('Rien à voler ici pour l\'instant')),
      bloc('Ce qui protège',
        installes.map((id) => {
          const m = cfg.materielSalle.find((x) => x.id === id);
          const sans = risqueApres(desinstalle(lieu, id));
          return h('div.fiche-ecart', h('span', m?.nom || id), h('span.nombre', `sans : ${pct(sans)}`));
        }),
        agents.map((x) => {
          const sans = risqueApres((c) => { const y = c.personnel.employes.find((z) => z.id === x.id); y.affectation = affectation(y).filter((id) => id !== lieu); });
          return h('div.fiche-ecart', h('span', `${x.nom} · ${role(cfg, x.role)?.nom.toLowerCase()}${affectation(x).length > 1 ? ` (${affectation(x).length} salles)` : ''}`), h('span.nombre', `sans : ${pct(sans)}`));
        }),
        !installes.length && !agents.length ? ligne('Rien : ni matériel, ni agent') : null),
      bloc('Installer', possibles.length ? possibles.map(ligneMateriel) : ligne('Tout est installé'))),
  });
}

/* ---------- Enquêtes ---------- */

/**
 * Dossier d'une œuvre volée : la chance de la police, les détectives en
 * mission, ceux que l'on peut engager (chance par semaine, tarif, durée), et
 * la piste en attente s'il y en a une.
 */
export function ficheDossier(app, oeuvreId) {
  const { jeu } = app;
  const cfg = jeu.cfg;
  const e = jeu.etat;
  const jour = jeu.jour();
  const o = e.oeuvres[oeuvreId];
  if (!o || o.lieu !== 'volee') return;
  const restant = cfg.securite.enqueteSemaines - Math.floor((jour - o.voleeLe) / 7);
  const enMission = (e.detectives?.carnet || []).filter((d) => d.mission?.oeuvre === o.id);
  const libres = detectivesLibres(e, jour).sort((a, b) => chanceDetective(cfg, b) - chanceDetective(cfg, a));
  const piste = (e.pistes || []).find((x) => x.oeuvre === o.id && x.expire > jour);
  const sansRien = 1 - (1 - chancePolice(cfg, e, o)) * enMission.reduce((q, d) => q * (1 - chanceDetective(cfg, d)), 1);
  let f = null;
  const recharger = (ok) => { if (ok) { const x = app.jeu.etat.oeuvres[oeuvreId]; if (x?.lieu === 'volee') ficheDossier(app, oeuvreId); } };

  const ligneDetective = (d) => {
    const n = niveauDetective(cfg, d);
    return h('div.detective',
      h('div.fiche-tete', portrait(d.nom), h('div',
        h('b', d.nom, profilCourt(d).map((m) => h('span.puce', { classe: m.bon ? 'bon' : 'mauvais' }, m.texte))),
        h('div.tres-discret', `Niveau ${n} · ${pct(chanceDetective(cfg, d))} par semaine · ${decimale(tarifDetective(cfg, e, d))} ✦ la semaine`))),
      h('div.durees', cfg.detectives.durees.map((sem) => {
        const prix = forfait(cfg, e, d, sem);
        return h('button.bouton.petit', {
          type: 'button', disabled: app.solde !== null && app.solde < prix,
          onclick: async () => {
            if (!(await confirmer(`Engager ${d.nom}`, { texte: `${sem} semaines · ${nombre(prix)} ✦`, oui: 'Engager' }))) return;
            f.fermer();
            recharger(await app.agir('engagerDetective', { oeuvre: o.id, detective: d.id, semaines: sem }, { succes: `${d.nom} sur l'affaire` }));
          },
        }, `${sem} sem. · ${nombre(prix)} ✦`);
      })));
  };

  f = feuille({
    titre: o.titre,
    contenu: h('div.fiche',
      h('div.fiche-risque', h('b', pct(sansRien)), h('span', `de la retrouver cette semaine · encore ${restant} semaines`)),
      piste ? bloc(`Piste à ${piste.ville}`,
        ligne(`Une œuvre qui lui ressemble est apparue dans une vente. Réponse avant le ${dateJour(piste.expire)}.`),
        h('div.rangee-boutons',
          h('button.bouton.or', {
            type: 'button', disabled: app.solde !== null && app.solde < piste.prix,
            onclick: async () => {
              if (!(await confirmer('Racheter discrètement ?', { texte: `${nombre(piste.prix)} ✦`, oui: 'Racheter' }))) return;
              f.fermer();
              await app.agir('racheterPiste', { piste: piste.id }, { succes: `${o.titre} revient` });
            },
          }, `Racheter · ${nombre(piste.prix)} ✦`),
          h('button.bouton', {
            type: 'button',
            onclick: async () => { f.fermer(); recharger(await app.agir('prevenirPolice', { piste: piste.id }, { succes: 'La police est prévenue' })); },
          }, 'Prévenir la police'))) : null,
      bloc('Sur l\'affaire',
        h('div.fiche-ecart', h('span', 'Police'), h('span.nombre', `${pct(chancePolice(cfg, e, o))} par semaine`)),
        enMission.map((d) => h('div.fiche-ecart', h('span', `${d.nom} · niveau ${niveauDetective(cfg, d)}`),
          h('span.nombre', `${pct(chanceDetective(cfg, d))} · jusqu'au ${dateJour(d.mission.fin)}`)))),
      bloc('Engager un détective',
        ligne(`Payé d'avance ; ${nombre(prime(cfg, o))} ✦ de prime à celui qui la ramène, réglés avec la session suivante.`),
        libres.length ? libres.map(ligneDetective) : ligne('Aucun détective disponible : nouveaux candidats lundi'))),
  });
}
