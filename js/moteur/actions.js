// Actions du joueur. Chaque action est pure : elle reçoit l'état et renvoie
// un nouvel état, plus la dépense ou le gain d'Éclats qu'elle implique.
// C'est l'orchestrateur (js/jeu.js) qui débite ou crédite le registre commun,
// avec la clé d'idempotence fournie ici, avant ou après l'enregistrement.

import {
  niveau, effets, prixArrivage, niveauMaitrise, bonusMaitrise, travailEffectif,
  travailRequis, bilanFinancier, estConforme, frequentationAnnualisee,
} from './regles.js';
import {
  effetsPersonnel, masseSalariale, partAssistant, role as roleDe, niveauEmploye, fraisRecrutement, rolesOuverts, personne, arrieresBloquants,
} from './personnel.js';
import {
  espace, contenuEspace, refusAccrochage, reserveLibre, priveeLibre, atelierLibre,
  prixAile, prixSalle, prixAgrandissement, prixReserve, prixPrivee, aileDisponible,
} from './batiment.js';
import { tauxHoraire, visiteursDuJour } from './visiteurs.js';
import { tableau } from './classement.js';
import { debloque } from './arrivages.js';
import { copie, evenement } from './etat.js';
import { peutEmprunter, seuilEmprunt } from './securite.js';
import { bonusReputation } from './journee.js';
import { entrerDansLePublic, sortirDuPublic } from './lieux.js';

export class ErreurJeu extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ErreurJeu';
    this.code = code;
  }
}

function refuser(message, code = 'refus') {
  throw new ErreurJeu(message, code);
}

function oeuvreDe(etat, id) {
  const o = etat.oeuvres[id];
  if (!o) refuser('Œuvre introuvable', 'introuvable');
  return o;
}

/* ---------- Identité ---------- */

export function nommer(cfg, etat0, nom) {
  const n = String(nom || '').trim().slice(0, 60);
  if (!n) refuser('Nom vide');
  const etat = copie(etat0);
  etat.nom = n;
  return { etat };
}

/* ---------- Arrivages ---------- */

/**
 * Achète une œuvre d'un arrivage. `fiche` est l'entrée du catalogue : ses
 * attributs (support, siècle, artiste…) sont copiés dans l'état, qui doit se
 * suffire pour simuler les visiteurs sans charger le catalogue.
 */
export function acheter(cfg, etat0, { arrivage, oeuvre, fiche }, jour) {
  const etat = copie(etat0);
  const a = etat.arrivages.find((x) => x.id === arrivage);
  if (!a || a.expire <= jour) refuser('Arrivage expiré', 'expire');
  const ligne = a.oeuvres.find((o) => o.id === oeuvre);
  if (!ligne) refuser('Œuvre absente de l\'arrivage');
  if (ligne.achetee || etat.oeuvres[oeuvre]) refuser('Déjà acquise', 'deja');
  if (reserveLibre(etat) <= 0) refuser('Réserve pleine', 'reserve');
  const prix = ligne.offerte ? 0 : prixArrivage(cfg, etat, ligne.niveau);
  ligne.achetee = true;
  etat.oeuvres[oeuvre] = {
    id: oeuvre,
    titre: fiche?.titre || '?',
    artiste: fiche?.artiste || null,
    support: ligne.support,
    niveau: ligne.niveau,
    an: fiche?.an ?? null,
    mouvement: fiche?.mouvement || null,
    pays: fiche?.pays || null,
    lieu: 'reserve',
    progression: 0,
    acquiseLe: jour,
    restaureeLe: null,
    joursExpo: 0,
    sortieLe: null,
    minutes: 0,
    prix,
  };
  return {
    etat,
    depense: prix > 0 ? {
      montant: prix,
      cle: `musee:achat:${arrivage}:${oeuvre}`,
      motif: `Acquisition : ${fiche?.titre || `œuvre ${oeuvre}`}`,
      type: 'acquisition',
      meta: { oeuvre, arrivage, niveau: ligne.niveau },
    } : null,
  };
}

/* ---------- Déplacements ---------- */

/**
 * Déplace une œuvre. `vers` : { lieu: 'reserve' | 'privee' | 'atelier' }
 * ou { lieu: 'espace', espace, place }. Si la place visée est occupée, son
 * occupant prend la place de l'œuvre déplacée (ou part en réserve).
 */
export function deplacer(cfg, etat0, { oeuvre, vers }, jour) {
  const etat = copie(etat0);
  const o = oeuvreDe(etat, oeuvre);
  if (o.lieu === 'pret') refuser('Œuvre prêtée', 'pret');
  if (o.lieu === 'volee') refuser('Œuvre volée', 'volee');
  if (o.lieu === 'exposition') refuser('Œuvre en exposition', 'exposition');
  if (etat.session?.oeuvre === o.id) refuser('Session en cours', 'session');
  const depuis = { lieu: o.lieu, espace: o.espace, place: o.place };
  const etaitPublic = o.lieu === 'espace';

  if (vers.lieu === 'atelier') {
    if (o.progression >= 1) refuser('Déjà restaurée');
    if (o.lieu !== 'atelier' && atelierLibre(cfg, etat) <= 0) refuser('Atelier complet', 'atelier');
    poser(o, { lieu: 'atelier' });
  } else if (vers.lieu === 'reserve') {
    if (o.lieu !== 'reserve' && reserveLibre(etat) <= 0) refuser('Réserve pleine', 'reserve');
    poser(o, { lieu: 'reserve' });
  } else if (vers.lieu === 'privee') {
    if (o.progression < 1) refuser('Restauration inachevée');
    if (o.lieu !== 'privee' && priveeLibre(etat) <= 0) refuser('Collection privée pleine', 'privee');
    poser(o, { lieu: 'privee' });
  } else if (vers.lieu === 'espace') {
    const raison = refusAccrochage(cfg, etat, o, vers.espace);
    if (raison) refuser(raison, 'accrochage');
    const e = espace(etat, vers.espace);
    if (vers.place < 0 || vers.place >= e.places) refuser('Place inexistante');
    const occupantId = contenuEspace(etat, vers.espace)[vers.place];
    if (occupantId !== null && occupantId !== o.id) {
      const occ = etat.oeuvres[occupantId];
      if (depuis.lieu === 'espace' && !refusAccrochage(cfg, etat, occ, depuis.espace)) {
        poser(occ, { lieu: 'espace', espace: depuis.espace, place: depuis.place });
      } else if (depuis.lieu === 'privee') {
        poser(occ, { lieu: 'privee' });
        sortirDuPublic(occ, jour);
      } else {
        poser(occ, { lieu: 'reserve' });
        sortirDuPublic(occ, jour);
      }
    }
    poser(o, { lieu: 'espace', espace: vers.espace, place: vers.place });
    if (!etaitPublic) entrerDansLePublic(cfg, o, jour);
  } else {
    refuser('Destination inconnue');
  }
  if (etaitPublic && o.lieu !== 'espace') sortirDuPublic(o, jour);
  return { etat };
}

function poser(o, { lieu, espace: e, place }) {
  o.lieu = lieu;
  if (lieu === 'espace') { o.espace = e; o.place = place; } else { delete o.espace; delete o.place; }
}

/** Thème d'un espace public : null pour aucun. */
export function definirTheme(cfg, etat0, { espace: id, theme }) {
  const etat = copie(etat0);
  const b = etat.batiment;
  const e = id === 'cabinet' ? b.cabinet : id === 'jardin' ? b.jardin : b.salles.find((s) => s.id === id);
  if (!e) refuser('Espace inconnu');
  if (theme && !cfg.themes.some((t) => t.id === theme.type)) refuser('Thème inconnu');
  e.theme = theme ? { type: theme.type, valeur: theme.valeur, libelle: theme.libelle } : null;
  return { etat };
}

export function renommerSalle(cfg, etat0, { espace: id, nom }) {
  const etat = copie(etat0);
  const s = etat.batiment.salles.find((x) => x.id === id);
  if (!s) refuser('Salle inconnue');
  s.nom = String(nom || '').trim().slice(0, 40) || s.nom;
  return { etat };
}

/* ---------- Billet ---------- */

export function fixerPrix(cfg, etat0, prix) {
  const p = Number(prix);
  if (!Number.isInteger(p) || p < 0 || p > cfg.visiteurs.prix.max) refuser('Prix invalide');
  const etat = copie(etat0);
  etat.prixBillet = p;
  return { etat };
}

/* ---------- Investissements ---------- */

/** Liste des achats possibles, avec prix et disponibilité. */
export function catalogueInvestissements(cfg, etat) {
  const b = etat.batiment;
  const liste = [];
  const ajouter = (x) => liste.push(x);

  const pa = prixAile(cfg, etat);
  ajouter({ id: 'aile', categorie: 'batiment', nom: `Aile ${b.ailes + 1}`, prix: pa, refus: pa === null ? 'Maximum atteint' : null });
  const ps = prixSalle(cfg, etat);
  ajouter({ id: 'salle', categorie: 'batiment', nom: 'Salle', prix: ps, refus: aileDisponible(cfg, etat) ? null : 'Toutes les ailes sont pleines' });
  ajouter({ id: 'reserve', categorie: 'batiment', nom: `Réserve +${cfg.batiment.reserve.places}`, prix: prixReserve(cfg, etat), refus: null });
  ajouter({ id: 'privee', categorie: 'batiment', nom: `Collection privée +${cfg.batiment.privee.places}`, prix: prixPrivee(cfg, etat), refus: null });

  for (const type of ['cabinet', 'jardin', 'exposition']) {
    const e = cfg.espaces[type];
    let refus = null;
    if (b[type]) refus = 'Acquis';
    else if (etat.statut < e.statutMin) refus = cfg.statuts[e.statutMin].nom;
    ajouter({ id: `espace:${type}`, categorie: 'espaces', nom: e.nom, prix: e.prix, refus, acquis: !!b[type] });
  }

  for (const inv of cfg.investissements) {
    let refus = null;
    if (etat.investissements.includes(inv.id)) refus = 'Acquis';
    else if (inv.statutMin && etat.statut < inv.statutMin) refus = cfg.statuts[inv.statutMin].nom;
    else if (inv.prerequis && !etat.investissements.includes(inv.prerequis)) {
      refus = cfg.investissements.find((i) => i.id === inv.prerequis)?.nom || 'Prérequis';
    }
    ajouter({ id: `inv:${inv.id}`, categorie: inv.categorie, nom: inv.nom, prix: inv.prix, refus, acquis: etat.investissements.includes(inv.id), effets: inv.effets });
  }
  return liste;
}

/** Achète un investissement : `aile`, `salle`, `reserve`, `privee`, `espace:<type>`, `inv:<id>`, `agrandir:<espace>`. */
export function investir(cfg, etat0, { quoi }, jour = etat0.jourFerme + 1) {
  const etat = copie(etat0);
  const b = etat.batiment;
  let prix;
  let cle;
  let motif;

  if (quoi === 'aile') {
    prix = prixAile(cfg, etat);
    if (prix === null) refuser('Maximum d\'ailes atteint');
    b.ailes += 1;
    cle = `musee:aile:${b.ailes}`;
    motif = `Aile ${b.ailes}`;
  } else if (quoi === 'salle') {
    const aile = aileDisponible(cfg, etat);
    if (!aile) refuser('Toutes les ailes sont pleines');
    prix = prixSalle(cfg, etat);
    b.sallesAchetees += 1;
    const n = b.salles.length + 1;
    let id = `s${n}`;
    while (b.salles.some((s) => s.id === id)) id = `s${Number(id.slice(1)) + 1}`;
    b.salles.push({ id, nom: `Salle ${n}`, aile, places: cfg.batiment.salle.places, agrandissements: 0, theme: null });
    cle = `musee:salle:${b.sallesAchetees}`;
    motif = `Salle ${n}`;
  } else if (quoi.startsWith('agrandir:')) {
    const id = quoi.slice('agrandir:'.length);
    prix = prixAgrandissement(cfg, etat, id);
    if (prix === null) refuser('Agrandissement impossible');
    const e = id === 'cabinet' ? b.cabinet : b.salles.find((s) => s.id === id);
    e.agrandissements = (e.agrandissements || 0) + 1;
    e.places = Math.min(cfg.batiment.agrandissement.max, e.places + cfg.batiment.agrandissement.places);
    cle = `musee:agrandir:${id}:${e.agrandissements}`;
    motif = `Agrandissement : ${e.nom || id}`;
  } else if (quoi === 'reserve') {
    prix = prixReserve(cfg, etat);
    b.reserve.achats += 1;
    b.reserve.places += cfg.batiment.reserve.places;
    cle = `musee:reserve:${b.reserve.achats}`;
    motif = 'Réserve agrandie';
  } else if (quoi === 'privee') {
    prix = prixPrivee(cfg, etat);
    b.privee.achats += 1;
    b.privee.places += cfg.batiment.privee.places;
    cle = `musee:privee:${b.privee.achats}`;
    motif = 'Collection privée agrandie';
  } else if (quoi.startsWith('espace:')) {
    const type = quoi.slice('espace:'.length);
    const e = cfg.espaces[type];
    if (!e || !e.prix) refuser('Espace inconnu');
    if (b[type]) refuser('Déjà acquis');
    if (etat.statut < e.statutMin) refuser(`Statut requis : ${cfg.statuts[e.statutMin].nom}`);
    prix = e.prix;
    b[type] = { nom: e.nom, places: e.places, agrandissements: 0, theme: null };
    cle = `musee:espace:${type}`;
    motif = e.nom;
  } else if (quoi.startsWith('inv:')) {
    const id = quoi.slice('inv:'.length);
    const inv = cfg.investissements.find((i) => i.id === id);
    if (!inv) refuser('Investissement inconnu');
    if (etat.investissements.includes(id)) refuser('Déjà acquis');
    if (inv.statutMin && etat.statut < inv.statutMin) refuser(`Statut requis : ${cfg.statuts[inv.statutMin].nom}`);
    if (inv.prerequis && !etat.investissements.includes(inv.prerequis)) refuser('Prérequis manquant');
    prix = inv.prix;
    etat.investissements.push(id);
    cle = `musee:inv:${id}`;
    motif = inv.nom;
    // Un matériel qui ouvre un métier amène son premier candidat : on
    // n'achète pas une vidéosurveillance pour attendre lundi un opérateur.
    for (const r of cfg.personnel.roles.filter((x) => x.equipement === id)) {
      if (!etat.personnel) break;
      etat.personnel.candidats.push({
        ...personne(cfg, { id: `c${jour}-${id}`, role: r.id, niveau: 1, graine: `${etat.graine}:${id}` }),
        expire: jour + cfg.personnel.validiteCandidatsJours,
      });
    }
  } else {
    refuser('Investissement inconnu');
  }
  return { etat, depense: { montant: prix, cle, motif, type: 'investissement', meta: { quoi } } };
}

/* ---------- Communication ---------- */

export function etatCampagne(cfg, etat, jour) {
  const c = etat.campagne;
  if (c && jour < c.fin) return { active: c, disponibleLe: null };
  const disponibleLe = c ? c.fin + cfg.campagnesDelai : null;
  return { active: null, disponibleLe: disponibleLe !== null && disponibleLe > jour ? disponibleLe : null };
}

/** Coût d'une campagne : multiple des visiteurs par jour actuels. */
export function coutCampagne(cfg, etat, id, jour) {
  const c = cfg.campagnes.find((x) => x.id === id);
  const derniers = etat.historique[etat.historique.length - 1]?.visiteurs ?? visiteursDuJour(cfg, etat, jour);
  const remise = effetsPersonnel(cfg, etat).communication?.remise || 0;
  return Math.max(1, Math.round(c.coutVisiteurs * derniers * (1 - remise)));
}

/** Durée d'une campagne : le chargé de communication la prolonge. */
export function dureeCampagne(cfg, etat, id) {
  const c = cfg.campagnes.find((x) => x.id === id);
  return c.jours + (effetsPersonnel(cfg, etat).communication?.jours || 0);
}

export function lancerCampagne(cfg, etat0, { id }, jour) {
  const c = cfg.campagnes.find((x) => x.id === id);
  if (!c) refuser('Campagne inconnue');
  if (c.statutMin && etat0.statut < c.statutMin) refuser(`Statut requis : ${cfg.statuts[c.statutMin].nom}`);
  const e = etatCampagne(cfg, etat0, jour);
  if (e.active) refuser('Une campagne est en cours');
  if (e.disponibleLe) refuser('Délai entre deux campagnes', 'delai');
  const prix = coutCampagne(cfg, etat0, id, jour);
  const etat = copie(etat0);
  etat.campagne = { id, debut: jour, fin: jour + dureeCampagne(cfg, etat0, id), cout: prix };
  return { etat, depense: { montant: prix, cle: `musee:campagne:${id}:${jour}`, motif: c.nom, type: 'campagne', meta: { id, jour } } };
}

/* ---------- Prêts ---------- */

export function accepterPret(cfg, etat0, _params, jour) {
  const etat = copie(etat0);
  const d = etat.prets.demande;
  if (!d || d.expire <= jour) refuser('Aucune demande en cours');
  const o = etat.oeuvres[d.oeuvre];
  if (!o || o.lieu !== 'espace') refuser('L\'œuvre n\'est plus en salle');
  o.retour = { lieu: 'espace', espace: o.espace, place: o.place };
  o.lieu = 'pret';
  delete o.espace;
  delete o.place;
  sortirDuPublic(o, jour);
  etat.prets.enCours.push({ ...d, debut: jour, fin: jour + d.duree });
  etat.prets.demande = null;
  bonusReputation(cfg, etat, cfg.reputation.bonusPret);
  return {
    etat,
    gain: { montant: d.remuneration, cle: `musee:pret:${d.id}`, motif: `Prêt à ${d.museeNom}`, type: 'pret', meta: { oeuvre: d.oeuvre, musee: d.musee, duree: d.duree } },
  };
}

export function refuserPret(cfg, etat0) {
  const etat = copie(etat0);
  const d = etat.prets.demande;
  if (!d) refuser('Aucune demande en cours');
  etat.prets.historique.push({ ...d, issue: 'refusee' });
  etat.prets.demande = null;
  return { etat };
}

/* ---------- Expositions temporaires ---------- */

export function etatExpositions(cfg, etat, jour) {
  const x = etat.expositions;
  const possible = debloque(cfg, etat, 'expositions') && !!etat.batiment.exposition;
  const disponibleLe = x.derniereFin !== null && x.derniereFin !== undefined
    ? x.derniereFin + cfg.expositions.delaiJours : null;
  return {
    possible,
    courante: x.courante,
    disponibleLe: disponibleLe !== null && disponibleLe > jour ? disponibleLe : null,
  };
}

/** Musées où l'on peut emprunter : classés au plus 30 rangs au-dessus du joueur. */
export function museesPreteurs(cfg, etat, musees) {
  const annualisee = etat.classement?.annualisee ?? frequentationAnnualisee(cfg, etat.historique);
  const lignes = tableau(cfg, etat, musees, annualisee);
  const i = lignes.findIndex((l) => l.joueur);
  return lignes.slice(Math.max(0, i - cfg.expositions.rangsAuDessus), i).map((l) => l.id);
}

export function coutEmprunt(cfg, n, etat = null) {
  const remise = etat ? (effetsPersonnel(cfg, etat).commissaire?.remise || 0) : 0;
  return Math.round(cfg.expositions.coutEmprunt * niveau(cfg, n).prix * (1 - remise));
}

/**
 * Ouvre une exposition. `oeuvres` : ids possédés ; `emprunts` : fiches du
 * catalogue (avec `musee`). Toutes doivent être conformes au thème.
 */
export function ouvrirExposition(cfg, etat0, { id, theme, oeuvres, emprunts }, jour, musees) {
  const x = cfg.expositions;
  const st = etatExpositions(cfg, etat0, jour);
  if (!st.possible) refuser('Salle d\'exposition requise');
  if (st.courante) refuser('Une exposition est en cours');
  if (st.disponibleLe) refuser('Délai entre deux expositions', 'delai');
  if (!theme || !cfg.themes.some((t) => t.id === theme.type)) refuser('Thème requis');
  const total = oeuvres.length + emprunts.length;
  if (total < x.minOeuvres || total > Math.min(x.maxOeuvres, etat0.batiment.exposition.places)) {
    refuser(`De ${x.minOeuvres} à ${x.maxOeuvres} œuvres`);
  }
  if (emprunts.length > Math.floor(total * x.partEmpruntsMax)) refuser('Trop d\'emprunts');

  const etat = copie(etat0);
  for (const oid of oeuvres) {
    const o = oeuvreDe(etat, oid);
    if (o.progression < 1) refuser(`${o.titre} : restauration inachevée`);
    if (!['espace', 'reserve', 'privee'].includes(o.lieu)) refuser(`${o.titre} : indisponible`);
    if (!estConforme(o, theme)) refuser(`${o.titre} : hors thème`);
    const requise = cfg.securiteRequise[o.niveau] || 0;
    if (requise > effets(cfg, etat).securite) refuser(`${o.titre} : sécurité niveau ${requise} requise`);
  }
  const preteurs = new Set(museesPreteurs(cfg, etat, musees || []));
  for (const em of emprunts) {
    if (!estConforme(em, theme)) refuser(`${em.titre} : hors thème`);
    if (!preteurs.has(em.musee)) refuser(`${em.titre} : musée trop éloigné au classement`);
    if (etat.oeuvres[em.id]) refuser(`${em.titre} : déjà dans vos collections`);
    if (!peutEmprunter(cfg, etat0, em.niveau, jour)) {
      refuser(`${em.titre} : le prêteur exige un risque sous ${Math.round(seuilEmprunt(cfg, em.niveau) * 1000) / 10} % par semaine`, 'securite');
    }
  }

  for (const oid of oeuvres) {
    const o = etat.oeuvres[oid];
    const etaitPublic = o.lieu === 'espace';
    o.retour = { lieu: o.lieu, espace: o.espace, place: o.place };
    o.lieu = 'exposition';
    delete o.espace;
    delete o.place;
    if (!etaitPublic) entrerDansLePublic(cfg, o, jour);
  }
  const prix = emprunts.reduce((s, em) => s + coutEmprunt(cfg, em.niveau, etat0), 0);
  etat.expositions.courante = {
    id,
    theme: { type: theme.type, valeur: theme.valeur, libelle: theme.libelle },
    debut: jour,
    fin: jour + x.dureeJours,
    oeuvres: [...oeuvres],
    emprunts: emprunts.map((em) => ({
      id: em.id, titre: em.titre, artiste: em.artiste || null, niveau: em.niveau, support: em.support,
      an: em.an ?? null, mouvement: em.mouvement || null, pays: em.pays || null, musee: em.musee,
    })),
    visiteurs: 0,
  };
  return {
    etat,
    depense: prix > 0 ? { montant: prix, cle: `musee:exposition:${id}`, motif: `Exposition : ${theme.libelle}`, type: 'exposition', meta: { emprunts: emprunts.length } } : null,
  };
}

/* ---------- Sessions ---------- */

/**
 * Ce qui est figé au lancement d'une session : taux de recettes, masse
 * salariale, abattement du comptable, et le travail confié aux assistants.
 */
export function figerSession(cfg, etat, oeuvreId, jour) {
  const o = oeuvreDe(etat, oeuvreId);
  const minutesSupport = etat.maitrise[o.support] || 0;
  const ep = effetsPersonnel(cfg, etat);
  // Chaque assistant prend une autre œuvre de l'atelier, la plus avancée
  // d'abord, tant qu'elle n'a pas atteint le plafond de préparation.
  const plafond = roleDe(cfg, 'assistant')?.plafond ?? 0;
  const aPreparer = Object.values(etat.oeuvres)
    .filter((x) => x.lieu === 'atelier' && x.id !== o.id && x.progression < plafond)
    .sort((a, b) => b.progression - a.progression || a.id - b.id);
  const assistants = ep.assistants.slice(0, aPreparer.length).map((a, i) => ({
    employe: a.id, nom: a.nom, oeuvre: aPreparer[i].id, niveau: aPreparer[i].niveau,
    progression: aPreparer[i].progression, part: partAssistant(cfg, a.niveau, a.efficacite ?? 1),
  }));
  return {
    support: o.support,
    niveau: o.niveau,
    progressionDepart: o.progression,
    maitriseDepart: minutesSupport,
    bonus: bonusMaitrise(cfg, minutesSupport) + effets(cfg, etat).efficacite,
    tauxHoraire: tauxHoraire(cfg, etat, jour),
    salaireHoraire: masseSalariale(cfg, etat),
    abattement: ep.abattement,
    plafondAssistants: plafond,
    assistants,
  };
}

export function demarrerSession(cfg, etat0, { id, oeuvre, dureeMin, debut }, jour) {
  const s = cfg.session;
  if (etat0.session) refuser('Une session est déjà en cours', 'session');
  const d = Math.round(Number(dureeMin));
  if (!(d >= s.dureeMinMin && d <= s.dureeMaxMin)) refuser(`Durée de ${s.dureeMinMin} min à ${s.dureeMaxMin / 60} h`);
  const o = oeuvreDe(etat0, oeuvre);
  if (o.lieu !== 'atelier') refuser('L\'œuvre doit être à l\'atelier');
  if (o.progression >= 1) refuser('Déjà restaurée');
  const requise = niveau(cfg, o.niveau).maitrise;
  const actuelle = niveauMaitrise(cfg, etat0.maitrise[o.support] || 0);
  if (actuelle < requise) refuser(`Maîtrise ${requise} requise`, 'maitrise');
  const etat = copie(etat0);
  etat.session = { id, oeuvre, dureeMin: d, debut, jour, figes: figerSession(cfg, etat0, oeuvre, jour) };
  return { etat };
}

/**
 * Résultat d'une session arrêtée à `finMs` (horloge du serveur). Le temps
 * compté est borné à la durée prévue ; sous le seuil, rien ne compte.
 * `arrieres` : salaires restés dus des sessions précédentes.
 */
export function resultatSession(cfg, session, finMs, { arrieres = 0 } = {}) {
  const prevueMs = session.dureeMin * 60e3;
  const ecouleMs = Math.max(0, Math.min(prevueMs, finMs - session.debut));
  let minutes = Math.floor(ecouleMs / 60e3);
  const complete = ecouleMs >= prevueMs;
  if (complete) minutes = session.dureeMin;
  if (minutes < cfg.session.seuilArretMin) minutes = 0;
  const f = session.figes;
  const travail = minutes ? travailEffectif(cfg, minutes, f.bonus) : 0;
  const requis = travailRequis(cfg, f.niveau);
  const reste = requis * (1 - f.progressionDepart);
  const utile = Math.min(travail, reste);
  // Un assistant apporte une part du travail du maître à son œuvre, sans
  // dépasser le plafond de préparation.
  const assistants = (f.assistants || []).map((a) => {
    const avant = a.progression;
    const apres = Math.min(f.plafondAssistants, avant + travail * a.part / travailRequis(cfg, a.niveau));
    return { ...a, avant, apres: Math.max(avant, apres) };
  });
  const finances = bilanFinancier(cfg, {
    tauxHoraire: f.tauxHoraire,
    salaireHoraire: f.salaireHoraire || 0,
    minutes,
    arrieres: minutes ? arrieres : 0,
    abattement: f.abattement || 0,
  });
  return {
    minutes,
    complete,
    travail,
    utile,
    perdu: travail - utile,
    progressionAvant: f.progressionDepart,
    progressionApres: Math.min(1, f.progressionDepart + utile / requis),
    assistants,
    finances,
    eclats: finances.net,
    maitriseAvant: f.maitriseDepart,
    maitriseApres: f.maitriseDepart + minutes,
  };
}

export function terminerSession(cfg, etat0, finMs, jour) {
  const etat = copie(etat0);
  const s = etat.session;
  if (!s) refuser('Aucune session en cours');
  const r = resultatSession(cfg, s, finMs, { arrieres: etat.personnel?.arrieres || 0 });
  const o = etat.oeuvres[s.oeuvre];
  if (o) {
    o.progression = r.progressionApres;
    o.minutes = (o.minutes || 0) + r.minutes;
    if (o.progression >= 1 && !o.restaureeLe) o.restaureeLe = jour;
  }
  // Les assistants n'avancent une œuvre que si elle est encore à l'atelier.
  for (const a of r.assistants) {
    const x = etat.oeuvres[a.oeuvre];
    if (x && x.lieu === 'atelier' && x.progression < a.apres) x.progression = a.apres;
  }
  etat.maitrise[s.figes.support] = (etat.maitrise[s.figes.support] || 0) + r.minutes;

  // L'équipe travaille pendant la session : ses heures la font progresser.
  const promotions = [];
  if (etat.personnel && r.minutes) {
    for (const e of etat.personnel.employes) {
      const avant = niveauEmploye(cfg, e.minutes);
      e.minutes += r.minutes;
      const apres = niveauEmploye(cfg, e.minutes);
      if (apres > avant) {
        promotions.push({ employe: e.id, nom: e.nom, role: e.role, niveau: apres });
        evenement(etat, jour, 'promotion', { employe: e.id, nom: e.nom, role: e.role, niveau: apres });
      }
    }
    etat.personnel.arrieres = r.finances.arrieresRestants;
  }

  const entree = {
    id: s.id, debut: s.debut, fin: s.debut + r.minutes * 60e3, jour: s.jour,
    oeuvre: s.oeuvre, titre: o?.titre || '?', support: s.figes.support,
    minutes: r.minutes, travail: Math.round(r.travail), perdu: Math.round(r.perdu),
    avant: r.progressionAvant, apres: r.progressionApres, eclats: r.eclats,
    recettes: Math.round(r.finances.recettes),
    salaires: Math.round(r.finances.salaires + r.finances.arrieresPayes),
    impot: Math.round(r.finances.impot),
    arrieres: Math.round(r.finances.arrieresRestants),
    assistants: r.assistants.map((a) => ({ nom: a.nom, oeuvre: a.oeuvre, avant: a.avant, apres: a.apres })),
    promotions: promotions.map((p) => ({ nom: p.nom, role: p.role, niveau: p.niveau })),
    verse: r.eclats === 0,
  };
  etat.sessions.push(entree);
  if (etat.sessions.length > 2000) etat.sessions = etat.sessions.slice(-2000);
  etat.session = null;
  return {
    etat,
    resultat: { ...r, session: entree, promotions },
    gain: r.eclats > 0 ? {
      montant: r.eclats, cle: `musee:session:${s.id}`, referenceId: s.id,
      motif: `Session : ${o?.titre || 'restauration'}`, type: 'session',
      meta: { oeuvre: s.oeuvre, minutes: r.minutes, recettes: entree.recettes, salaires: entree.salaires, impot: entree.impot },
    } : null,
  };
}

/* ---------- Personnel ---------- */

/** Embauche un candidat : frais de recrutement payés sur la Centrale. */
export function embaucher(cfg, etat0, { candidat }, jour) {
  const etat = copie(etat0);
  const p = etat.personnel;
  if (arrieresBloquants(cfg, etat)) refuser('Salaires en retard : recrutement impossible', 'arrieres');
  const c = p.candidats.find((x) => x.id === candidat);
  if (!c || c.expire <= jour) refuser('Candidature expirée', 'expire');
  if (!rolesOuverts(cfg, etat).some((r) => r.id === c.role)) refuser('Métier pas encore ouvert');
  const frais = fraisRecrutement(cfg, etat, c);
  p.candidats = p.candidats.filter((x) => x.id !== candidat);
  const { expire, niveau: n, ...personne } = c;
  p.employes.push({ ...personne, id: `e${c.id.slice(1)}`, embaucheLe: jour });
  return {
    etat,
    depense: {
      montant: frais, cle: `musee:embauche:${c.id}`, motif: `Recrutement : ${c.nom}`, type: 'recrutement',
      meta: { role: c.role, niveau: n },
    },
  };
}

/** Licencie : gratuit et immédiat. */
export function licencier(cfg, etat0, { employe }) {
  const etat = copie(etat0);
  const avant = etat.personnel.employes.length;
  etat.personnel.employes = etat.personnel.employes.filter((e) => e.id !== employe);
  if (etat.personnel.employes.length === avant) refuser('Employé introuvable');
  return { etat };
}

/** Marque le gain d'une session comme versé au registre. */
export function marquerVerse(cfg, etat0, sessionId) {
  const etat = copie(etat0);
  const s = etat.sessions.find((x) => x.id === sessionId);
  if (s) s.verse = true;
  return { etat };
}

/* ---------- Catalogue ---------- */

/**
 * Nouveaux niveaux venus de la mise à jour mensuelle du catalogue. La
 * progression reste un pourcentage : le travail déjà fait est conservé. Une
 * session en cours garde le niveau figé à son lancement.
 */
export function ajusterNiveaux(cfg, etat0, { niveaux }) {
  const etat = copie(etat0);
  for (const [id, n] of Object.entries(niveaux || {})) {
    const o = etat.oeuvres[id];
    if (o && cfg.niveaux[n]) o.niveau = n;
  }
  return { etat };
}

/* ---------- Réglages ---------- */

export function reglages(cfg, etat0, modifs) {
  const etat = copie(etat0);
  etat.reglages = { ...etat.reglages, ...modifs };
  return { etat };
}

export function imagePerso(cfg, etat0, { oeuvre, chemin }) {
  const etat = copie(etat0);
  const o = oeuvreDe(etat, oeuvre);
  if (chemin) o.imagePerso = chemin; else delete o.imagePerso;
  return { etat };
}

export function marquerRapportVu(cfg, etat0, _params, jour) {
  const etat = copie(etat0);
  for (const r of etat.rapports) if (r.jour <= jour) r.vu = true;
  return { etat };
}
