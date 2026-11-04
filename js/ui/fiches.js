// Fiches détaillées du personnel, des métiers, du matériel et des menaces.
// Les cartes restent courtes ; un appui ouvre la fiche : à quoi ça sert, ce
// que ça change ici (calculé sur une copie de l'état avec les vrais
// moteurs, avant → après), ce que ça coûte, ce qu'il faut pour l'avoir.

import { h, icone, nombre } from './dom.js';
import { feuille, portrait, confirmer, cartel } from './composants.js';
import { MENACES, risques, probabilites, chanceEnquete } from '../moteur/securite.js';
import {
  role, refusRole, minutesPourNiveau, niveauEmploye, salaireHoraire, fraisRecrutement,
  avecNiveaux, partAssistant, arrieresBloquants,
} from '../moteur/personnel.js';
import { visiteursDuJour, espacesOuverts, satisfaction, seuilDensite } from '../moteur/visiteurs.js';
import { placesPubliques } from '../moteur/batiment.js';
import { catalogueInvestissements } from '../moteur/actions.js';
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
  enqueteur: 'Travaille avec la police pour retrouver les œuvres volées.',
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
  serrures: 'Portes et fenêtres renforcées. Une première protection contre les cambriolages.',
  alarme: 'Détecte les intrusions la nuit et prévient aussitôt.',
  video: 'Des caméras dans les salles et autour du bâtiment, jour et nuit.',
  portiques: 'Des détecteurs à l\'entrée : outils, bombes de peinture et objets dangereux restent dehors.',
  salleForte: 'Une réserve blindée. Les œuvres qui y sont rangées n\'attirent presque plus les cambrioleurs.',
  chenil: 'Loge les chiens de garde. Ne protège rien seul : il faut des maîtres-chiens.',
  vitrines: 'Les œuvres les plus exposées passent sous verre : on ne peut plus les toucher ni les emporter.',
  pcSecurite: 'Une salle de contrôle qui réunit alarmes, caméras et rondes.',
  securite1: 'La norme exigée pour exposer tes propres Chefs-d\'œuvre.',
  drones: 'Survolent le musée la nuit et repèrent les intrus de loin.',
  securite2: 'La norme la plus haute, exigée pour exposer tes Trésors.',
};

const MENACE = {
  nuit: {
    texte: 'La nuit, des voleurs s\'introduisent dans le musée. Ils visent ce qui a le plus de valeur, où qu\'il soit : salles, collection privée, réserve, atelier.',
    suite: 'Une œuvre volée, et la réputation baisse. La police enquête pendant 26 semaines.',
  },
  jour: {
    texte: 'Pendant les visites, quelqu\'un glisse une œuvre exposée sous son manteau. Plus les salles sont bondées, plus c\'est facile ; estampes et photographies partent le plus vite.',
    suite: 'Une œuvre exposée volée, et la réputation baisse.',
  },
  vandalisme: {
    texte: 'Un visiteur s\'en prend à une œuvre exposée. Les plus célèbres attirent les vandales ; une œuvre modeste ne risque presque rien.',
    suite: 'L\'œuvre perd 15 à 40 points de restauration et retourne en réserve.',
  },
};

/* ---------- Mesures ---------- */

const pct = (p) => `${(p * 100).toLocaleString('fr-FR', { maximumFractionDigits: p < 0.1 ? 1 : 0 })} %`;
const decimale = (x) => x.toLocaleString('fr-FR', { maximumFractionDigits: x < 10 ? 1 : 0 });

// Ce que l'on compare avant et après. `mieux` : +1 si plus est mieux.
const INDICATEURS = [
  { id: 'nuit', nom: 'Cambriolage', format: (v) => `${pct(v)} / sem.`, mieux: -1 },
  { id: 'jour', nom: 'Vol en salle', format: (v) => `${pct(v)} / sem.`, mieux: -1 },
  { id: 'vandalisme', nom: 'Vandalisme', format: (v) => `${pct(v)} / sem.`, mieux: -1 },
  { id: 'salles', nom: 'Salles ouvertes', format: (v) => nombre(v), mieux: 1 },
  { id: 'visiteurs', nom: 'Visiteurs par jour', format: (v) => nombre(v), mieux: 1 },
  { id: 'satisfaction', nom: 'Satisfaction', format: (v) => decimale(v), mieux: 1 },
  { id: 'foule', nom: 'Foule supportée', format: (v) => `${nombre(v)} visiteurs`, mieux: 1 },
  { id: 'enquete', nom: 'Œuvre volée retrouvée', format: (v) => `${pct(v)} / sem.`, mieux: 1 },
];

/** Les indicateurs d'un état, calculés par les moteurs du jeu. */
function mesurer(cfg, etat, jour) {
  const p = probabilites(cfg, etat, jour);
  const v = visiteursDuJour(cfg, etat, jour);
  return {
    ...p,
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
    etat.personnel.employes.push({ id: p.id || '__essai', nom: p.nom, role: p.role, minutes: minutesPourNiveau(cfg, niveau) });
  };
}

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
  return court(liste) || effetsPropres(cfg, p.role, niveau).find(Boolean) || null;
}

/** À quoi sert un métier, en une phrase. */
export function resumeMetier(id) {
  return (ROLES[id] || '').split(/(?<=\.) /)[0];
}

export const modifs = { embauche: (cfg, c) => aNiveau(cfg, { ...c, id: '__essai' }, c.niveau), depart, achat, retrait };

/* ---------- Effets propres à un métier ---------- */

/** Ce que les indicateurs ne montrent pas : travail, campagnes, arrivages… */
function effetsPropres(cfg, id, niveau) {
  const r = role(cfg, id) || {};
  const p = (x) => `${Math.round(x * 100)} %`;
  switch (id) {
    case 'assistant': return [`Avance une autre œuvre à ${p(partAssistant(cfg, niveau))} de ton rythme`, `Tous assistants réunis : ${p(r.plafond)} au plus`];
    case 'communication': {
      const j = Math.floor(niveau / r.joursTousLes);
      return [`Campagnes ${p(Math.min(0.9, r.remiseBase + r.remiseNiveau * niveau))} moins chères`, j ? `Campagnes prolongées de ${j} j` : null];
    }
    case 'conservateur': return [`Arrivages : ${niveau >= 6 ? r.oeuvresNiveau6 : r.oeuvres} œuvre${(niveau >= 6 ? r.oeuvresNiveau6 : r.oeuvres) > 1 ? 's' : ''} de plus chaque lundi`];
    case 'regisseur': return [`Demandes de prêt : +${p(r.probabilitePret)} de chances chaque semaine`, `Prêts payés ${p(r.remunerationBase + r.remunerationNiveau * niveau)} de plus`];
    case 'commissaire': return [`Expositions : ${p(r.attraitBase + r.attraitNiveau * niveau)} de visiteurs en plus`, `Emprunts ${p(Math.min(0.9, r.remiseBase + r.remiseNiveau * niveau))} moins chers`];
    case 'comptable': return [`Impôt ${p(Math.min(0.9, r.abattementBase + r.abattementNiveau * niveau))} plus bas`];
    case 'technicien': return [`Matériel électronique ${p(r.materielBase + r.materielNiveau * niveau)} plus efficace`];
    case 'chefSecurite': return [`Protection de toute l'équipe +${p(r.humainBase + r.humainNiveau * niveau)}`];
    default: return [];
  }
}

/** Ce qu'apporte chaque niveau, en clair, pour la fiche d'un métier. */
function parNiveau(cfg, r) {
  const noms = { nuit: 'cambriolage', jour: 'vol en salle', vandalisme: 'vandalisme' };
  const l = [];
  if (r.menaces) l.push(`Protège contre : ${Object.keys(r.menaces).map((m) => noms[m]).join(', ')}, un peu plus à chaque niveau`);
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
  const salaire = salaireHoraire(cfg, e, { role: p.role, niveau });
  const apport = candidat
    ? ecarts(app, modifs.embauche(cfg, p))
    : ecarts(app, depart(p.id)).map(inverse);
  const suivant = niveau < cfg.personnel.niveauMax ? niveau + 1 : null;
  const auSuivant = !candidat && suivant ? ecarts(app, aNiveau(cfg, p, suivant)) : [];
  const resteH = suivant ? Math.max(0, Math.ceil((minutesPourNiveau(cfg, suivant) - p.minutes) / 60)) : 0;
  const doublon = r?.unique && avecNiveaux(cfg, e).some((x) => x.role === p.role && x.id !== p.id && x.niveau >= niveau);

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
      bloc(candidat ? 'Si tu l\'embauches' : 'Son apport, sans → avec',
        lignesEcarts(apport),
        effetsPropres(cfg, p.role, niveau).map(ligne),
        doublon ? ligne('Un autre membre de l\'équipe fait déjà mieux : sans effet tant qu\'il reste') : null,
        !apport.length && !effetsPropres(cfg, p.role, niveau).length && !doublon ? ligne('Aucun effet mesurable aujourd\'hui') : null),
      bloc('Coût',
        candidat ? ligne(`Embauche : ${nombre(fraisRecrutement(cfg, e, p))} ✦, une fois`) : null,
        ligne(`Salaire : ${decimale(salaire)} ✦ par heure de session, prélevé à la fin de chaque session`)),
      !candidat && suivant ? bloc(`Niveau ${suivant} dans ${resteH} h de sessions`,
        lignesEcarts(auSuivant),
        ligne(`Salaire : ${decimale(salaireHoraire(cfg, e, { role: p.role, niveau: suivant }))} ✦ par heure`)) : null,
      bloc(null, parNiveau(cfg, r || {}).map(ligne))),
    actions: h('div', { style: { marginTop: '14px' } }, actions),
  });
  return f;
}

/** Fiche d'un métier : ce qu'il fait, ce qu'il faut pour l'ouvrir, son salaire. */
export function ficheMetier(app, r) {
  const { jeu } = app;
  const cfg = jeu.cfg;
  const e = jeu.etat;
  const refus = refusRole(cfg, e, r);
  const membres = avecNiveaux(cfg, e).filter((x) => x.role === r.id);
  const candidats = (e.personnel?.candidats || []).filter((c) => c.role === r.id && c.expire > jeu.jour());
  const mat = r.equipement ? cfg.investissements.find((i) => i.id === r.equipement) : null;
  feuille({
    titre: r.nom,
    contenu: h('div.fiche',
      h('p.fiche-texte', ROLES[r.id] || ''),
      bloc('Ce qu\'apporte un employé de niveau 1', effetsPropres(cfg, r.id, 1).map(ligne), parNiveau(cfg, r).map(ligne)),
      bloc('Pour l\'ouvrir',
        r.statutMin ? ligne(`Statut ${cfg.statuts[r.statutMin].nom}${r.statutMin <= e.statut ? ' : atteint' : ''}`) : null,
        mat ? ligne(`Matériel : ${mat.nom}${(e.investissements || []).includes(mat.id) ? ' : acquis' : ` (${nombre(mat.prix)} ✦)`}`) : null,
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
  const noms = { nuit: 'cambriolage', jour: 'vol en salle', vandalisme: 'vandalisme' };
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
        f0.salleForte ? ligne('Réserve trois fois moins visée la nuit') : null,
        f0.securite === 1 ? ligne('Tes Chefs-d\'œuvre deviennent exposables') : null,
        f0.securite === 2 ? ligne('Tes Trésors deviennent exposables') : null,
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

/** Les œuvres que la menace vise le plus, avec leur part du risque. */
function cibles(app, m) {
  const { jeu } = app;
  const cfg = jeu.cfg;
  const e = jeu.etat;
  const s = cfg.securite;
  const exposee = (o) => o.lieu === 'espace' || o.lieu === 'exposition';
  const poids = (o) => {
    if (m === 'nuit') {
      if (o.lieu === 'reserve') return (e.investissements || []).includes('salleForte') ? s.poids.reserveForte : s.poids.reserve;
      return s.poids[o.lieu] ?? 0;
    }
    if (!exposee(o)) return 0;
    return m === 'jour' ? (s.portabilite[o.support] ?? 1) : prestige(cfg, o.niveau) ** (s.menaces.vandalisme.exposant - 1);
  };
  const liste = Object.values(e.oeuvres).map((o) => [o, prestige(cfg, o.niveau) * poids(o)]).filter(([, w]) => w > 0);
  const total = liste.reduce((t, [, w]) => t + w, 0);
  return liste.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([o, w]) => ({ o, part: w / total }));
}

/** Fiche d'une menace : ce qu'elle fait, ce qui l'attire, ce qui protège, quoi ajouter. */
export function ficheMenace(app, m) {
  const { jeu } = app;
  const cfg = jeu.cfg;
  const e = jeu.etat;
  const jour = jeu.jour();
  const p = probabilites(cfg, e, jour)[m];
  const n = niveauRisque(p);
  const nom = cfg.securite.menaces[m].nom;
  const sans = (modifier) => {
    const copie = structuredClone(e);
    modifier(copie);
    return probabilites(cfg, copie, jour)[m];
  };

  // Ce qui protège déjà : chaque source, et le risque si elle disparaissait.
  const sources = [];
  for (const x of avecNiveaux(cfg, e)) {
    const q = sans(depart(x.id));
    if (q - p > 1e-5) sources.push({ nom: `${x.nom} · ${role(cfg, x.role)?.nom.toLowerCase()}`, q });
  }
  for (const id of e.investissements || []) {
    const inv = cfg.investissements.find((i) => i.id === id);
    if (inv?.categorie !== 'securite') continue;
    const q = sans(retrait(id));
    if (q - p > 1e-5) sources.push({ nom: inv.nom, q });
  }
  sources.sort((a, b) => b.q - a.q);

  // Ce que l'on peut ajouter : matériel disponible et candidats de la semaine.
  const apres = (modifier) => { const copie = structuredClone(e); modifier(copie); return probabilites(cfg, copie, jour)[m]; };
  const pistes = [];
  for (const x of catalogueInvestissements(cfg, e).filter((y) => y.categorie === 'securite' && !y.acquis && !y.refus)) {
    const q = apres(achat(x.id.replace(/^inv:/, '')));
    if (p - q > 1e-5) pistes.push({ nom: x.nom, detail: `${nombre(x.prix)} ✦`, q, ouvrir: () => ficheMateriel(app, x) });
  }
  for (const c of (e.personnel?.candidats || []).filter((y) => y.expire > jour)) {
    const q = apres(modifs.embauche(cfg, c));
    if (p - q > 1e-5) pistes.push({ nom: c.nom, detail: `${role(cfg, c.role)?.nom} · niv. ${c.niveau}`, q, ouvrir: () => fichePersonne(app, c, { candidat: true }) });
  }
  pistes.sort((a, b) => a.q - b.q);

  let f = null;
  const lien = (x, valeur) => h('button.fiche-lien', { type: 'button', onclick: () => { f.fermer(); x.ouvrir(); } },
    h('span', h('b', x.nom), h('small', x.detail)), h('span.nombre', valeur), icone('droite'));
  const r = risques(cfg, e, jour)[m];

  f = feuille({
    titre: nom,
    contenu: h('div.fiche',
      h('div.fiche-risque', h('b', { style: { color: n.couleur } }, pct(p)), h('span', `par semaine · ${n.mot.toLowerCase()}`)),
      h('p.fiche-texte', MENACE[m].texte),
      bloc('Si ça arrive', ligne(MENACE[m].suite), ligne('Tirage chaque dimanche à 4 h')),
      bloc('Ce qui l\'attire',
        r > 0 ? cibles(app, m).map(({ o, part }) => h('div.fiche-ecart', h('span', cartel(app, o, null).titre), h('span.nombre', `${Math.round(part * 100)} %`))) : ligne('Rien à voler ici pour l\'instant')),
      bloc('Ce qui te protège, et le risque sans',
        sources.length ? sources.map((x) => h('div.fiche-ecart', h('span', x.nom), h('span.nombre', pct(x.q)))) : ligne('Rien')),
      bloc('Pour le réduire',
        pistes.length ? pistes.slice(0, 5).map((x) => lien(x, `→ ${pct(x.q)}`)) : ligne('Rien de disponible cette semaine'))),
  });
}

