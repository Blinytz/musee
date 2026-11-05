#!/usr/bin/env node
// Simulation d'équilibrage (spec, section 20). Elle importe les moteurs du jeu
// tels quels : changer un paramètre dans js/config.js puis relancer suffit à
// voir son effet sur les délais.
//
//   node outils/simulation.mjs                 tableau de référence
//   node outils/simulation.mjs --heures 1,2,5  autres rythmes
//   node outils/simulation.mjs --reputation libre  réputation calculée par le jeu
//   node outils/simulation.mjs --json          sortie machine
//   node outils/simulation.mjs --horizon 1000  bilan à date fixe (comparer deux réglages)
//   node outils/simulation.mjs --sans-equipe   sans équipe de sécurité
//
// Joueur de référence : une session par jour, une œuvre à la fois, toujours le
// plus haut niveau accessible (statut et maîtrise), toujours de la peinture,
// toutes les œuvres exposées, réputation 60, sans thème, billet à 1 Éclat.
// Le surplus d'une session qui achève une œuvre est perdu. Les salles
// manquantes sont achetées au moins cher (agrandissement, salle ou aile).
//
// Depuis docs/ECONOMIE.md : il embauche au niveau 1 un gardien pour chaque
// salle garnie (sinon elle reste fermée) et une équipe de sécurité modeste
// (`EQUIPE`), achète le matériel de sécurité dès qu'il s'ouvre, et rien
// d'autre. Un agrandissement sort de terre pendant les sessions : en
// attendant, l'œuvre restaurée patiente en réserve. Les gains affichés sont
// nets de toutes les charges et de l'impôt ; `--sans-vol` coupe vols et
// vandalisme.

import { CONFIG, configEffective } from '../js/config.js';
import { creerEtat } from '../js/moteur/etat.js';
import { fermerJour, ouvrirJour } from '../js/moteur/journee.js';
import {
  demarrerSession, terminerSession, deplacer, investir, confierAtelier, installer,
} from '../js/moteur/actions.js';
import { affectationParDefaut, materielDe, valeurLieu } from '../js/moteur/securite.js';
import { niveauMaitrise, prixArrivage, bilanFinancier } from '../js/moteur/regles.js';
import { personne, fraisRecrutement, masseSalariale, rolesOuverts, employes } from '../js/moteur/personnel.js';
import {
  espacesPublics, contenuEspace, prixAgrandissement, prixSalle, prixAile, aileDisponible, refusAccrochage,
} from '../js/moteur/batiment.js';
import { tauxHoraire, espacesOuverts } from '../js/moteur/visiteurs.js';
import { chargesHoraires } from '../js/moteur/charges.js';

// Repères : jours pour 2, 3 et 4 h par jour (spec), gain net par heure visé
// par docs/PROPOSITION-GESTION.md (le musée garde de 9 à 5 % du billet).
const REPERES = {
  1: { jours: [3, 4, 4], gain: 12 },
  2: { jours: [24, 16, 13], gain: 38 },
  3: { jours: [5 * 30.44, 3.5 * 30.44, 2.7 * 30.44], gain: 255 },
  4: { jours: [17 * 30.44, 10 * 30.44, 8 * 30.44], gain: 615 },
  5: { jours: [2.6 * 365, 1.6 * 365, 1.1 * 365], gain: 920 },
};
const HEURES_REPERES = [2, 3, 4];

// Équipe de sécurité du joueur de référence, selon le statut : un veilleur
// par statut, un exemplaire de chaque métier spécialisé dès que son matériel
// est là, un agent de sûreté de plus par statut au-delà du national.
const EQUIPE = {
  veilleur: (st) => st,
  operateur: () => 1,
  surete: (st) => Math.max(1, st - 2),
  maitreChien: () => 1,
  technicien: () => 1,
  chefSecurite: () => 1,
  pilote: () => 1,
  // Restaurateurs d'atelier : un par statut, pour les réparations.
  assistant: (st) => st,
};

function lireOptions(argv) {
  const o = { heures: HEURES_REPERES, jours: 365 * 4, reputation: 60, json: false, support: 'peinture' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--heures') o.heures = argv[++i].split(',').map(Number);
    else if (a === '--jours') o.jours = Number(argv[++i]);
    else if (a === '--reputation') { const v = argv[++i]; o.reputation = v === 'libre' ? null : Number(v); }
    else if (a === '--json') o.json = true;
    else if (a === '--support') o.support = argv[++i];
    else if (a === '--sans-vol') o.vols = false;
    else if (a === '--sans-equipe') o.equipe = false;
    else if (a === '--horizon') { o.horizon = true; o.jours = Number(argv[++i]); }
  }
  return o;
}

/** Place publique libre pour une peinture, ou null. */
function placeLibre(cfg, etat, support, oeuvre = null) {
  for (const e of espacesPublics(etat)) {
    if (!(cfg.espaces[e.type]?.supports || []).includes(support)) continue;
    if (oeuvre && refusAccrochage(cfg, etat, oeuvre, e.id)) continue;
    const i = contenuEspace(etat, e.id).indexOf(null);
    if (i >= 0) return { espace: e.id, place: i };
  }
  return null;
}

/**
 * Matériel salle par salle : porte et alarme partout où il y a des œuvres,
 * caméras dès le régional, vitrines dans les deux salles les plus
 * précieuses ; le niveau de sécurité qu'il faut là où un Chef-d'œuvre ou un
 * Trésor doit être accroché. Renvoie le montant dépensé.
 */
function equiperSalles(cfg, etat, oeuvreAAccrocher, support) {
  let paye = 0;
  let e = etat;
  const poser = (lieu, id) => {
    if (materielDe(e, lieu).includes(id)) return;
    try { const r = installer(cfg, e, { lieu, materiel: id }); e = r.etat; paye += r.depense.montant; } catch { /* statut ou prérequis */ }
  };
  const salles = espacesPublics(e).filter((x) => contenuEspace(e, x.id).some((y) => y !== null))
    .sort((a, b) => valeurLieu(cfg, e, b.id) - valeurLieu(cfg, e, a.id));
  salles.forEach((sl, rang) => {
    poser(sl.id, 'porte');
    poser(sl.id, 'alarme');
    poser(sl.id, 'cameras');
    if (rang < 2) poser(sl.id, 'vitrines');
  });
  if (e.statut >= 2) poser('reserve', 'blindage');
  const requise = oeuvreAAccrocher ? cfg.securiteRequise[oeuvreAAccrocher.niveau] || 0 : 0;
  if (requise && !placeLibre(cfg, e, support, oeuvreAAccrocher)) {
    const cible = espacesPublics(e).find((x) => contenuEspace(e, x.id).includes(null) && (cfg.espaces[x.type]?.supports || []).includes(support));
    if (cible) { poser(cible.id, 'norme1'); if (requise >= 2) poser(cible.id, 'norme2'); }
  }
  return { etat: e, paye };
}

/** Achète la capacité la moins chère ; renvoie le prix payé. Un chantier à la fois. */
function agrandir(cfg, etat) {
  if ((etat.chantiers || []).length) return null;
  const options = [];
  for (const e of etat.batiment.salles) {
    const p = prixAgrandissement(cfg, etat, e.id);
    if (p !== null) options.push({ quoi: `agrandir:${e.id}`, prix: p });
  }
  if (aileDisponible(cfg, etat)) options.push({ quoi: 'salle', prix: prixSalle(cfg, etat) });
  else {
    const pa = prixAile(cfg, etat);
    if (pa !== null) options.push({ quoi: 'aile', prix: pa + prixSalle(cfg, etat) });
  }
  if (!options.length) return null;
  options.sort((a, b) => a.prix - b.prix);
  // L'aile d'abord ; sa salle s'achètera une fois l'aile livrée.
  const r = investir(cfg, etat, { quoi: options[0].quoi });
  return { etat: r.etat, paye: r.depense.montant };
}

export async function simuler(cfg, heuresParJour, opts = {}) {
  const support = opts.support || 'peinture';
  // Réputation de référence : 60, fixe. `null` la laisse évoluer selon le jeu.
  const reputation = 'reputation' in opts ? opts.reputation : 60;
  const jourDepart = 20000;
  let etat = creerEtat(cfg, { nom: 'Référence', jour: jourDepart, graine: 'simulation' });
  const ctx = { musees: [], tirer: null };
  let prochainId = 1;
  const compte = {
    depenses: 0, oeuvres: 0, capacite: 0, securite: 0, recrutement: 0, gains: 0, deficitMax: 0,
    recettes: 0, salaires: 0, impots: 0, vols: 0, vandalismes: 0, retrouvees: 0, perdues: 0,
    accueil: 0, entretien: 0, assurance: 0, fournitures: 0, reparations: 0,
  };
  let embauches = 0;
  const atteints = {};
  const perdus = [];

  for (let j = 0; j < (opts.jours || 365 * 4); j++) {
    const jour = jourDepart + j;

    // Une œuvre à l'atelier, du plus haut niveau accessible.
    let enCours = Object.values(etat.oeuvres).find((o) => o.lieu === 'atelier' && !o.travaux && o.progression < 1);
    // Une œuvre retrouvée après un vol revient abîmée : on la reprend d'abord.
    const abimee = Object.values(etat.oeuvres).find((o) => o.lieu === 'reserve' && o.progression < 1);
    if (!enCours && abimee) {
      etat = deplacer(cfg, etat, { oeuvre: abimee.id, vers: { lieu: 'atelier' } }, jour).etat;
      enCours = etat.oeuvres[abimee.id];
    }
    if (!enCours) {
      const m = niveauMaitrise(cfg, etat.maitrise[support]);
      let n = 0;
      for (let k = 0; k <= cfg.statuts[etat.statut].niveauMax; k++) if (cfg.niveaux[k].maitrise <= m) n = k;
      const id = prochainId++;
      const prix = prixArrivage(cfg, etat, n);
      etat.oeuvres[id] = {
        id, titre: `Œuvre ${id}`, support, niveau: n, lieu: 'atelier', progression: 0,
        acquiseLe: jour, restaureeLe: null, joursExpo: 0, sortieLe: null, minutes: 0,
      };
      compte.depenses += prix;
      compte.oeuvres += prix;
      enCours = etat.oeuvres[id];
    }

    // La session du jour.
    if (reputation !== null) etat.reputation = reputation;
    const debut = j * 864e5;
    etat = demarrerSession(cfg, etat, { id: `s${j}`, oeuvre: enCours.id, dureeMin: heuresParJour * 60, debut }, jour).etat;
    const fin = terminerSession(cfg, etat, debut + heuresParJour * 3600e3, jour);
    etat = fin.etat;
    compte.gains += fin.resultat.eclats;
    compte.recettes += fin.resultat.finances.recettes;
    compte.salaires += fin.resultat.finances.salaires;
    compte.impots += fin.resultat.finances.impot;
    for (const k of ['accueil', 'entretien', 'assurance', 'fournitures']) compte[k] += fin.resultat.finances[k] || 0;
    if (fin.resultat.perdu > 0) perdus.push(fin.resultat.perdu);

    // Œuvre achevée : accrochée, sinon en réserve le temps qu'un chantier
    // livre une salle. Les œuvres qui attendent en réserve passent d'abord.
    const o = etat.oeuvres[enCours.id];
    if (o.progression >= 1) {
      // Réserve pleine : il l'agrandit.
      if (etat.batiment.reserve.places - Object.values(etat.oeuvres).filter((y) => y.lieu === 'reserve').length <= 0) {
        const r = investir(cfg, etat, { quoi: 'reserve' });
        etat = r.etat;
        compte.depenses += r.depense.montant;
        compte.capacite += r.depense.montant;
      }
      etat = deplacer(cfg, etat, { oeuvre: o.id, vers: { lieu: 'reserve' } }, jour).etat;
    }
    for (const x of Object.values(etat.oeuvres).filter((y) => y.lieu === 'reserve' && y.progression >= 1)) {
      const eq = equiperSalles(cfg, etat, x, support);
      etat = eq.etat;
      compte.depenses += eq.paye;
      compte.securite += eq.paye;
      let place = placeLibre(cfg, etat, support, x);
      if (!place) {
        const a = agrandir(cfg, etat);
        if (a) {
          etat = a.etat;
          compte.depenses += a.paye;
          compte.capacite += a.paye;
          place = placeLibre(cfg, etat, support, x);
        }
      }
      if (!place) break;
      etat = deplacer(cfg, etat, { oeuvre: x.id, vers: { lieu: 'espace', ...place } }, jour).etat;
    }
    // Un gardien par salle garnie, l'équipe de sécurité, et le matériel de
    // sécurité dès qu'il s'ouvre.
    const recruter = (role) => {
      const g = personne(cfg, { id: `g${embauches++}`, role, niveau: 1, graine: `sim:${embauches}` });
      const frais = fraisRecrutement(cfg, etat, g);
      // Chaque agent de sécurité prend son poste, comme à l'embauche.
      if (cfg.personnel.roles.find((r) => r.id === role)?.menaces) g.affectation = affectationParDefaut(cfg, etat, g);
      etat.personnel.employes.push(g);
      compte.depenses += frais;
      compte.recrutement += frais;
    };
    while (espacesOuverts(cfg, etat, jour).fermes.length) recruter('gardien');
    if (opts.equipe !== false) {
      for (const r of rolesOuverts(cfg, etat)) {
        const voulu = EQUIPE[r.id]?.(etat.statut) || 0;
        while (employes(etat, r.id).length < voulu) recruter(r.id);
      }
    }
    // Réparations : les œuvres les plus usées partent à l'atelier dès qu'un
    // emplacement et un restaurateur sont libres ; s'il en attend trop, il
    // agrandit l'atelier.
    const usees = Object.values(etat.oeuvres)
      .filter((x) => (x.lieu === 'espace' || x.lieu === 'reserve') && x.progression >= 1 && (x.usure || 0) >= cfg.usure.aReparer * 0.75)
      .sort((a, b) => b.usure - a.usure);
    for (const x of usees) {
      try { etat = confierAtelier(cfg, etat, { oeuvre: x.id }, jour).etat; compte.reparations++; } catch { break; }
    }
    if (usees.length > 3 && employes(etat, 'assistant').length > 1) {
      try {
        const r = investir(cfg, etat, { quoi: 'atelier' });
        etat = r.etat;
        compte.depenses += r.depense.montant;
        compte.capacite += r.depense.montant;
      } catch { /* atelier au maximum */ }
    }
    for (const inv of cfg.investissements.filter((x) => x.categorie === 'securite')) {
      if (etat.investissements.includes(inv.id) || (inv.statutMin || 0) > etat.statut) continue;
      if (inv.prerequis && !etat.investissements.includes(inv.prerequis)) continue;
      const r = investir(cfg, etat, { quoi: `inv:${inv.id}` });
      etat = r.etat;
      compte.depenses += r.depense.montant;
      compte.securite += r.depense.montant;
    }
    compte.deficitMax = Math.max(compte.deficitMax, compte.depenses - compte.gains);

    // Fin de journée.
    if (reputation !== null) etat.reputation = reputation;
    const statutAvant = etat.statut;
    const histoAvant = etat.securite.historique.length;
    fermerJour(cfg, etat, jour, ctx);
    await ouvrirJour(cfg, etat, jour + 1, ctx);
    for (const h of etat.securite.historique.slice(histoAvant)) {
      if (h.type === 'vol' || h.type === 'volSalle') compte.vols++;
      else if (h.type === 'vandalisme') compte.vandalismes++;
      else if (h.type === 'retrouvee') compte.retrouvees++;
      else if (h.type === 'perdue') compte.perdues++;
    }
    for (let s = statutAvant + 1; s <= etat.statut; s++) {
      const brut = tauxHoraire(cfg, etat, jour + 1);
      atteints[s] = {
        jours: j + 1,
        gainHoraire: Math.round(brut),
        netHoraire: bilanFinancier(cfg, {
          tauxHoraire: brut, salaireHoraire: masseSalariale(cfg, etat), minutes: 60,
          charges: chargesHoraires(cfg, etat, jour + 1, Math.min(s, cfg.niveaux.length - 1)),
        }).net,
        oeuvres: Object.values(etat.oeuvres).filter((x) => x.progression >= 1).length,
        visiteurs: etat.historique[etat.historique.length - 1].visiteurs,
      };
    }
    if (etat.statut === cfg.statuts.length - 1 && !opts.horizon) break;
  }
  return { heuresParJour, atteints, compte, perteMoyenneMin: perdus.length ? perdus.reduce((a, b) => a + b, 0) / perdus.length : 0 };
}

function duree(jours) {
  if (jours === undefined) return 'jamais';
  if (jours < 60) return `${jours} j`;
  if (jours < 730) return `${(jours / 30.44).toFixed(1).replace('.', ',')} mois`;
  return `${(jours / 365).toFixed(1).replace('.', ',')} ans`;
}

function ecart(obtenu, cible) {
  if (obtenu === undefined || !cible) return '';
  const e = Math.round((obtenu / cible - 1) * 100);
  return `${e >= 0 ? '+' : ''}${e} %`;
}

async function principal() {
  const opts = lireOptions(process.argv.slice(2));
  const sansVol = { securite: { menaces: Object.fromEntries(['vol', 'vandalisme'].map((m) => [m, { max: 0, min: 0 }])) } };
  const cfg = configEffective(opts.vols === false ? sansVol : {});
  const resultats = [];
  for (const h of opts.heures) resultats.push(await simuler(cfg, h, opts));

  if (opts.json) {
    console.log(JSON.stringify(resultats, null, 2));
    return;
  }

  const lignes = [];
  const entete = ['Statut', ...opts.heures.map((h) => `${h} h/jour`), 'Brut/h', 'Net/h', 'Repère'];
  lignes.push(entete);
  for (let s = 1; s < cfg.statuts.length; s++) {
    const cellules = [cfg.statuts[s].nom];
    for (const r of resultats) {
      const a = r.atteints[s];
      const k = HEURES_REPERES.indexOf(r.heuresParJour);
      const cible = k >= 0 ? REPERES[s].jours[k] : null;
      cellules.push(a ? `${duree(a.jours)}${cible ? ` (${ecart(a.jours, cible)})` : ''}` : 'jamais');
    }
    const fourchette = (cle) => {
      const v = resultats.map((r) => r.atteints[s]?.[cle]).filter((x) => x !== undefined);
      return v.length ? `${Math.min(...v)}-${Math.max(...v)}` : '?';
    };
    cellules.push(fourchette('gainHoraire'), fourchette('netHoraire'));
    cellules.push(`${REPERES[s].jours.map(duree).join(' / ')} · ${REPERES[s].gain}/h`);
    lignes.push(cellules);
  }
  const largeurs = entete.map((_, i) => Math.max(...lignes.map((l) => String(l[i]).length)));
  for (const l of lignes) console.log(l.map((c, i) => String(c).padEnd(largeurs[i])).join('  '));
  console.log('');
  for (const r of resultats) {
    const c = r.compte;
    const n = (x) => Math.round(x).toLocaleString('fr-FR');
    console.log(`${r.heuresParJour} h/jour : recettes ${n(c.recettes)}, accueil ${n(c.accueil)}, salaires ${n(c.salaires)}, entretien ${n(c.entretien)}, `
      + `assurance ${n(c.assurance)}, fournitures ${n(c.fournitures)}, impôts ${n(c.impots)}, net ${n(c.gains)} ✦`);
    console.log(`  dépensés ${n(c.depenses)} ✦ (œuvres ${n(c.oeuvres)}, salles ${n(c.capacite)}, sécurité ${n(c.securite)}, recrutement ${n(c.recrutement)}), `
      + `soit ${Math.round(c.depenses / Math.max(1, c.gains) * 100)} % du net, apport extérieur maximal ${n(c.deficitMax)} ✦`);
    console.log(`  vols ${c.vols}, vandalismes ${c.vandalismes}, œuvres retrouvées ${c.retrouvees}, perdues ${c.perdues}, réparations ${c.reparations}`);
  }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('simulation.mjs')) {
  principal().catch((e) => { console.error(e); process.exit(1); });
}

export { CONFIG };
