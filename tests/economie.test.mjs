// Impôts, personnel et sécurité (docs/ECONOMIE.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configEffective } from '../js/config.js';
import { creerEtat, migrer } from '../js/moteur/etat.js';
import { impotHoraire, bilanFinancier } from '../js/moteur/regles.js';
import {
  salaireHoraire, niveauEmploye, tirerCandidats, effetsPersonnel, masseSalariale, fraisRecrutement, personne,
} from '../js/moteur/personnel.js';
import { espacesOuverts, visiteursDuJour } from '../js/moteur/visiteurs.js';
import { risques, protections, probabilites, tirages, enquete, peutEmprunter } from '../js/moteur/securite.js';
import { installer, affecter } from '../js/moteur/actions.js';
import {
  deplacer, demarrerSession, terminerSession, embaucher, licencier, investir, lancerCampagne, coutCampagne, ouvrirExposition,
  confierAtelier,
} from '../js/moteur/actions.js';
import { finirTravaux } from '../js/moteur/atelier.js';
import { ramener, fermerJour } from '../js/moteur/journee.js';
import { rolesOuverts } from '../js/moteur/personnel.js';
import { avancer } from '../js/moteur/journee.js';

const cfg = configEffective({});

function musee(oeuvres = [], options = {}) {
  const e = creerEtat(cfg, { nom: 'Test', jour: 20000, graine: 'g' });
  for (const o of oeuvres) {
    e.oeuvres[o.id] = {
      titre: `Œuvre ${o.id}`, support: 'peinture', niveau: 0, lieu: 'reserve', progression: 1,
      acquiseLe: 20000, restaureeLe: 20000, joursExpo: 0, sortieLe: null, minutes: 0, ...o,
    };
  }
  return Object.assign(e, options);
}

function accrocher(e, id, espace, place) {
  return deplacer(cfg, e, { oeuvre: id, vers: { lieu: 'espace', espace, place } }, 20000).etat;
}

function gardien(e, id = `g${e.personnel.employes.length}`, minutes = 0) {
  e.personnel.employes.push({ id, nom: id, role: 'gardien', minutes });
}

/* ---------- Impôts ---------- */

test('impôt : barème progressif par tranches du bénéfice horaire', () => {
  assert.equal(impotHoraire(cfg, 80), 0);
  assert.equal(impotHoraire(cfg, 600), 0.2 * 500);
  assert.equal(impotHoraire(cfg, 5000), 0.2 * 900 + 0.4 * 3000 + 0.55 * 1000);
});

test('fin de session : recettes, salaires, impôt, net arrondi en dessous', () => {
  const b = bilanFinancier(cfg, { tauxHoraire: 1200, salaireHoraire: 100, minutes: 120 });
  assert.equal(b.recettes, 2400);
  assert.equal(b.salaires, 200);
  assert.equal(b.benefice, 2200);
  assert.ok(Math.abs(b.impot - 2 * (0.2 * 900 + 0.4 * 100)) < 1e-9);
  assert.equal(b.net, Math.floor(2200 - b.impot));
  const comptable = bilanFinancier(cfg, { tauxHoraire: 1200, salaireHoraire: 100, minutes: 120, abattement: 0.25 });
  assert.ok(Math.abs(comptable.impot - b.impot * 0.75) < 1e-9);
});

test('fin de session : des Éclats entiers, et un net qui tombe juste', () => {
  // Taux fractionnaires (0,5 ✦/h, 7,3 ✦/h de recettes) : aucun montant ne l'est.
  for (const [taux, salaire, minutes, arrieres] of [[7.3, 0.5, 50, 0], [0.6, 0.5, 60, 0.4], [1234.5, 17.3, 95, 3], [3, 2.6, 37, 1.5]]) {
    const b = bilanFinancier(cfg, { tauxHoraire: taux, salaireHoraire: salaire, minutes, arrieres });
    for (const k of ['recettes', 'salaires', 'arrieresPayes', 'arrieresRestants', 'impot', 'net']) {
      assert.ok(Number.isInteger(b[k]), `${k} = ${b[k]}`);
    }
    if (b.arrieresRestants) assert.equal(b.arrieresRestants, b.salaires + Math.round(arrieres) - b.recettes);
    else assert.equal(b.net, b.recettes - b.salaires - b.arrieresPayes - b.impot);
  }
});

test('salaires non couverts : rien n\'est versé, le reste passe en arriérés', () => {
  const b = bilanFinancier(cfg, { tauxHoraire: 5, salaireHoraire: 8, minutes: 60, arrieres: 2 });
  assert.equal(b.net, 0);
  assert.equal(b.arrieresRestants, 5);
  const suite = bilanFinancier(cfg, { tauxHoraire: 50, salaireHoraire: 8, minutes: 60, arrieres: 5 });
  assert.equal(suite.arrieresPayes, 5);
  assert.equal(suite.net, 37);
});

/* ---------- Personnel ---------- */

test('le musée ouvre avec un gardien ; une salle garnie sans gardien reste fermée', () => {
  let e = musee([{ id: 1, niveau: 2 }, { id: 2, niveau: 0 }]);
  assert.equal(e.personnel.employes.length, 1);
  assert.equal(e.personnel.employes[0].role, 'gardien');
  e = accrocher(e, 1, 's1', 0);
  e = accrocher(e, 2, 's2', 0);
  const o = espacesOuverts(cfg, e, 20000);
  assert.deepEqual([...o.ouverts], ['s1'], 'le gardien va à la salle la plus prestigieuse');
  assert.deepEqual(o.fermes, ['s2']);
  const seul = visiteursDuJour(cfg, e, 20000);
  gardien(e);
  assert.ok(visiteursDuJour(cfg, e, 20000) > seul);
});

test('salaire : niveau, progression et grille du statut', () => {
  const e = musee();
  const g = { role: 'gardien', niveau: 1 };
  assert.equal(salaireHoraire(cfg, e, g), 0.5);
  e.statut = 5;
  assert.ok(Math.abs(salaireHoraire(cfg, e, { role: 'gardien', niveau: 3 }) - 0.5 * 1.15 ** 2 * 25) < 1e-9);
  assert.equal(niveauEmploye(cfg, 0), 1);
  assert.equal(niveauEmploye(cfg, 10 * 60), 2);
  assert.equal(niveauEmploye(cfg, 99999 * 60), 10);
});

test('candidats : reproductibles, métiers ouverts, niveaux plafonnés par le statut', () => {
  const e = musee();
  const a = tirerCandidats(cfg, e, 20003);
  assert.deepEqual(a, tirerCandidats(cfg, e, 20003));
  assert.equal(a.length, 6);
  for (const c of a) {
    assert.ok(['gardien', 'mediateur', 'accueil'].includes(c.role), c.role);
    assert.ok(c.niveau <= 2);
    assert.match(c.nom, /^\S+ \S+/);
  }
});

test('profils : deux candidats de même niveau ne se valent pas, en moyenne rien ne change', () => {
  const p = cfg.personnel.profil;
  const gens = Array.from({ length: 2000 }, (_, i) => personne(cfg, { id: `x${i}`, role: 'gardien', niveau: 2, graine: `essai:${i}` }));
  assert.deepEqual(gens[7], personne(cfg, { id: 'x7', role: 'gardien', niveau: 2, graine: 'essai:7' }), 'reproductible');
  const moyenne = (k) => gens.reduce((t, x) => t + x[k], 0) / gens.length;
  assert.ok(Math.abs(moyenne('efficacite') - 1) < 0.02, `efficacité moyenne ${moyenne('efficacite')}`);
  assert.ok(Math.abs(moyenne('salaire') - 1) < 0.02, `salaire moyen ${moyenne('salaire')}`);
  for (const x of gens) {
    assert.ok(x.efficacite >= p.efficaciteMin && x.efficacite <= p.efficaciteMax);
    assert.ok(x.salaire >= p.salaireMin && x.salaire <= p.salaireMax);
  }
  // Des affaires et des salaires trop élevés, pas seulement des copies.
  assert.ok(gens.some((x) => x.efficacite / x.salaire > 1.15) && gens.some((x) => x.efficacite / x.salaire < 0.87));
  assert.ok(new Set(gens.map((x) => x.efficacite)).size > 30);
});

test("profils : l'efficacité règle l'apport, la prétention règle le salaire", () => {
  const e = musee();
  e.personnel.employes = [{ id: 'a', nom: 'a', role: 'veilleur', minutes: 0, efficacite: 1.2, salaire: 0.9, affectation: ['s1'] }];
  e.statut = 1;
  assert.ok(Math.abs(protections(cfg, e).s1.vol - 6 * 1.2) < 1e-9);
  assert.ok(Math.abs(salaireHoraire(cfg, e, { role: 'veilleur', niveau: 1, salaire: 0.9 }) - 0.5 * 2 * 0.9) < 1e-9);
  // Un employé d'avant les profils garde exactement ses chiffres.
  e.personnel.employes = [{ id: 'b', nom: 'b', role: 'veilleur', minutes: 0, affectation: ['s1'] }];
  assert.equal(protections(cfg, e).s1.vol, 6);
});

test('embauche : frais de recrutement, refus avec des arriérés ; licenciement libre', () => {
  const e = musee();
  e.personnel.candidats = tirerCandidats(cfg, e, 20000);
  const c = e.personnel.candidats[0];
  const r = embaucher(cfg, e, { candidat: c.id }, 20000);
  assert.equal(r.depense.montant, fraisRecrutement(cfg, e, c));
  assert.equal(r.etat.personnel.employes.length, 2);
  assert.equal(r.etat.personnel.candidats.length, 5);
  const endette = { ...r.etat, personnel: { ...r.etat.personnel, arrieres: 1000 } };
  const leger = { ...r.etat, personnel: { ...r.etat.personnel, arrieres: 1 } };
  assert.ok(embaucher(cfg, leger, { candidat: r.etat.personnel.candidats[0].id }, 20000), 'un petit retard est toléré');
  assert.throws(() => embaucher(cfg, endette, { candidat: r.etat.personnel.candidats[0].id }, 20000), /retard/);
  const l = licencier(cfg, r.etat, { employe: r.etat.personnel.employes[1].id });
  assert.equal(l.etat.personnel.employes.length, 1);
});

test('assistants : avancent une autre œuvre de l\'atelier pendant la session, jusqu\'à 30 %', () => {
  let e = musee([{ id: 1, lieu: 'atelier', progression: 0 }, { id: 2, lieu: 'atelier', progression: 0.25, niveau: 0 }]);
  e.statut = 1;
  e.personnel.employes.push({ id: 'a1', nom: 'A', role: 'assistant', minutes: 0 });
  e = demarrerSession(cfg, e, { id: 's', oeuvre: 1, dureeMin: 60, debut: 0 }, 20000).etat;
  const r = terminerSession(cfg, e, 60 * 60e3, 20000);
  assert.ok(r.etat.oeuvres[2].progression > 0.25);
  assert.ok(r.etat.oeuvres[2].progression <= 0.30 + 1e-12);
  assert.equal(r.resultat.assistants.length, 1);
});

test('l\'équipe progresse avec les heures de session et la promotion est annoncée', () => {
  let e = musee([{ id: 1, lieu: 'atelier', progression: 0 }]);
  e.personnel.employes[0].minutes = 9 * 60 + 30;
  e = demarrerSession(cfg, e, { id: 's', oeuvre: 1, dureeMin: 60, debut: 0 }, 20000).etat;
  const r = terminerSession(cfg, e, 60 * 60e3, 20000);
  assert.equal(niveauEmploye(cfg, r.etat.personnel.employes[0].minutes), 2);
  assert.ok(r.etat.evenements.some((x) => x.type === 'promotion'));
});

test('communication : campagnes moins chères et plus longues', () => {
  const e = musee();
  e.statut = 1;
  e.historique.push({ jour: 19999, visiteurs: 100 });
  const sans = coutCampagne(cfg, e, 'affichage', 20000);
  e.personnel.employes.push({ id: 'c1', nom: 'C', role: 'communication', minutes: 140 * 60 });
  assert.ok(coutCampagne(cfg, e, 'affichage', 20000) < sans);
  const r = lancerCampagne(cfg, e, { id: 'affichage' }, 20000);
  assert.equal(r.etat.campagne.fin - r.etat.campagne.debut, 7 + 1);
});

/* ---------- Sécurité ---------- */

function employe(e, role, minutes = 0, affectation = ['s1']) {
  e.personnel.employes.push({ id: `${role}${e.personnel.employes.length}`, nom: role, role, minutes, affectation });
}

test('salle par salle : le risque vient des œuvres de la salle, la protection de ce qui y est', () => {
  let e = musee([{ id: 1, niveau: 2 }, { id: 2, niveau: 2, lieu: 'reserve' }, { id: 3, niveau: 2, lieu: 'privee' }]);
  e = accrocher(e, 1, 's1', 0);
  const r = risques(cfg, e, 20000);
  assert.ok(r.s1.vol > 0 && r.s1.vandalisme > 0);
  assert.equal(r.s2.vol, 0);
  assert.equal(r.reserve.vol, 8 * 0.6);
  assert.equal(r.reserve.vandalisme, 0);
  assert.ok(!('privee' in r), 'la collection privée est à l\'abri');
  // Le gardien de départ tient la salle 1 : vol +4.
  assert.equal(protections(cfg, e).s1.vol, 4);
  assert.equal(protections(cfg, e).s2.vol, 0);
  e = installer(cfg, e, { lieu: 's1', materiel: 'porte' }).etat;
  assert.equal(protections(cfg, e).s1.vol, 9);
  assert.equal(protections(cfg, e).s2.vol, 0);
  const c = cfg.securite.menaces.vol;
  assert.ok(Math.abs(probabilites(cfg, e, 20000).s1.vol - Math.max(c.min, c.base * r.s1.vol / (9 + c.plancher))) < 1e-12);
});

test('un agent couvre une à trois salles, et sa protection s\'y partage', () => {
  const e = musee();
  e.statut = 1;
  employe(e, 'veilleur', 0, ['s1']);
  assert.equal(protections(cfg, e).s1.vol, 4 + 6);
  e.personnel.employes.at(-1).affectation = ['s1', 's2'];
  assert.equal(protections(cfg, e).s1.vol, 4 + 3);
  assert.equal(protections(cfg, e).s2.vol, 3);
  assert.throws(() => affecter(cfg, e, { employe: e.personnel.employes.at(-1).id, lieux: ['s1', 's2', 'reserve', 'atelier'] }), /3 salles/);
});

test('le matériel ne vaut que par ceux qui le servent', () => {
  const e = musee();
  e.statut = 4;
  e.securite.salles = { s1: ['alarme', 'cameras'] };
  e.investissements = ['drones'];
  // Caméras à moitié sans opérateur dans la salle, drones au sol sans pilote.
  assert.equal(protections(cfg, e).s1.vol, 4 + 15 + 10);
  employe(e, 'operateur', 0, ['s1']);
  employe(e, 'pilote', 0, ['s2']);
  assert.equal(protections(cfg, e).s1.vol, 4 + 15 + 20 + 40 + 8);
  employe(e, 'technicien', 0, []);
  assert.ok(Math.abs(protections(cfg, e).s1.vol - (4 + 8 + (15 + 20 + 40) * 1.13)) < 1e-9);
});

test('le chef de la sécurité renforce toute la protection humaine', () => {
  const e = musee();
  e.statut = 3;
  employe(e, 'veilleur', 0, ['s1']);
  const avant = protections(cfg, e).s1.vol;
  employe(e, 'chefSecurite', 0, []);
  assert.ok(Math.abs(protections(cfg, e).s1.vol - avant * 1.13) < 1e-9);
});

test('certains métiers ne s\'ouvrent qu\'avec leur matériel, commun ou installé', () => {
  const e = musee();
  e.statut = 4;
  const ids = () => rolesOuverts(cfg, e).map((r) => r.id);
  assert.ok(!ids().includes('pilote'));
  assert.ok(!ids().includes('operateur'));
  e.investissements = ['drones'];
  e.securite.salles = { s2: ['cameras'] };
  assert.ok(ids().includes('pilote'));
  assert.ok(ids().includes('operateur'));
});

test('vol et vandalisme : chaque jour, reproductibles et lourds de conséquences', () => {
  let e = musee([{ id: 1, niveau: 3 }, { id: 2, niveau: 3, support: 'sculpture' }]);
  e = accrocher(e, 1, 's1', 0);
  e = accrocher(e, 2, 's1', 1);
  e.personnel.employes = [];
  const rep = e.reputation;
  const faits = [];
  for (let j = 20000; j < 20700 && faits.length < 2; j++) faits.push(...tirages(cfg, e, j));
  assert.ok(faits.length >= 1);
  assert.ok(e.reputation < rep, 'la réputation baisse');
  assert.ok(e.bonusPermanents < 0, 'la confiance aussi, durablement');
  for (const f of faits) {
    const o = e.oeuvres[f.oeuvre];
    if (f.type === 'vandalisme') {
      assert.equal(o.lieu, 'reserve');
      assert.equal(o.progression, 1, 'la restauration reste acquise');
      assert.ok(o.usure >= cfg.usure.vandalisme[0] && o.usure <= cfg.usure.vandalisme[1]);
    } else {
      assert.equal(o.lieu, 'volee');
      assert.ok(e.indemnites > 0, 'l\'assurance rembourse une part');
    }
  }
});

test('enquête : l\'œuvre retrouvée revient abîmée, sinon elle est perdue après 26 semaines', () => {
  const e = musee([{ id: 1, niveau: 3, lieu: 'volee', voleeLe: 20000 }, { id: 2, niveau: 1, lieu: 'volee', voleeLe: 20000 }]);
  const retrouve = configEffective({ securite: { enquete: 1 } });
  enquete(retrouve, e, 20007);
  assert.equal(e.oeuvres[1].lieu, 'reserve');
  // Elle revient usée, à réparer à l'atelier ; sa restauration reste acquise.
  assert.equal(e.oeuvres[1].progression, 1);
  assert.equal(e.oeuvres[1].usure, cfg.usure.retrouvee);
  const jamais = configEffective({ securite: { enquete: 0 } });
  e.oeuvres[2].lieu = 'volee';
  e.oeuvres[2].voleeLe = 20000;
  enquete(jamais, e, 20000 + 26 * 7);
  assert.equal(e.oeuvres[2], undefined);
  assert.equal(e.securite.historique.at(-1).type, 'perdue');
});

test('emprunts : un musée ne prête un Trésor qu\'à un musée sûr', () => {
  const oeuvres = [];
  for (let i = 1; i <= 6; i++) oeuvres.push({ id: i, niveau: 2, an: 1650 });
  let e = musee(oeuvres, { statut: 5 });
  e.batiment.exposition = { nom: 'Expo', places: 15 };
  for (let i = 1; i <= 6; i++) e = accrocher(e, i, i <= 3 ? 's1' : 's2', (i - 1) % 3);
  const musees = [{ id: 9, nom: 'Grand', visiteurs: 1e8, prestige: 1 }];
  const theme = { type: 'siecle', valeur: 17, libelle: 'XVIIe siècle' };
  const tresor = { id: 100, titre: 'T', niveau: 5, support: 'peinture', an: 1620, musee: 9 };
  const demande = { id: 'x', theme, oeuvres: [1, 2, 3, 4, 5], emprunts: [tresor] };
  assert.ok(!peutEmprunter(cfg, e, 5, 20000));
  assert.throws(() => ouvrirExposition(cfg, e, demande, 20000, musees), /risque sous 1,5 %|risque sous 1.5 %/);
  e.investissements = ['portiques'];
  for (const sl of ['s1', 's2']) e.securite.salles[sl] = ['porte', 'alarme', 'vitrines', 'norme1', 'norme2'];
  for (let i = 0; i < 4; i++) employe(e, 'surete', 400 * 60, ['s1']);
  for (let i = 0; i < 4; i++) employe(e, 'surete', 400 * 60, ['s2']);
  assert.ok(peutEmprunter(cfg, e, 5, 20000));
  assert.ok(ouvrirExposition(cfg, e, demande, 20000, musees).etat.expositions.courante);
});

test('les journées tirent candidats et cambriolages, à l\'identique d\'un rejeu à l\'autre', async () => {
  let e = musee([{ id: 1, niveau: 3 }, { id: 2, niveau: 2 }]);
  e = accrocher(e, 1, 's1', 0);
  e = accrocher(e, 2, 's1', 1);
  const ctx = { musees: [], tirer: async () => null };
  const a = await avancer(cfg, e, 20060, ctx);
  const b = await avancer(cfg, e, 20060, ctx);
  assert.deepEqual(a, b);
  assert.ok(a.personnel.candidats.length > 0);
});

test('migration : un état du premier format reçoit son personnel', () => {
  const e = musee();
  e.format = 1;
  delete e.personnel;
  delete e.securite;
  e.investissements = ['cafe', 'mediateurs'];
  const m = migrer(e, cfg);
  assert.deepEqual(m.investissements, ['cafe']);
  assert.deepEqual(m.personnel.employes.map((x) => x.role), ['gardien', 'mediateur']);
  assert.equal(m.format, 4);
  assert.equal(niveauEmploye(cfg, m.personnel.employes[1].minutes), 3);
  assert.ok(effetsPersonnel(cfg, m).satisfaction > 0);
  assert.ok(masseSalariale(cfg, m) > 0);
});

test('migration : l\'agent de sécurité du format 2 devient veilleur de nuit', () => {
  const e = musee();
  e.format = 2;
  e.personnel.employes.push({ id: 'x', nom: 'X', role: 'securite', minutes: 0 });
  assert.equal(migrer(e, cfg).personnel.employes.at(-1).role, 'veilleur');
});

test('un matériel qui ouvre un métier amène aussitôt un premier candidat, affecté à l\'embauche', () => {
  const e = musee();
  e.statut = 2;
  const r = installer(cfg, e, { lieu: 's1', materiel: 'cameras' });
  const c = r.etat.personnel.candidats.at(-1);
  assert.equal(c.role, 'operateur');
  const embauche = embaucher(cfg, r.etat, { candidat: c.id }, 20000).etat.personnel.employes.find((x) => x.role === 'operateur');
  assert.equal(embauche.affectation.length, 1);
});

test('migration : le matériel commun s\'installe dans la salle la plus précieuse', () => {
  let e = musee([{ id: 1, niveau: 3 }]);
  e = accrocher(e, 1, 's2', 0);
  e.format = 3;
  e.investissements = ['cafe', 'serrures', 'video', 'salleForte', 'portiques'];
  delete e.securite.salles;
  e.personnel.employes.forEach((x) => delete x.affectation);
  e.personnel.employes.push({ id: 'v', nom: 'V', role: 'veilleur', minutes: 0 });
  const m = migrer(e, cfg);
  assert.deepEqual(m.investissements, ['cafe', 'portiques']);
  assert.deepEqual(m.securite.salles.s2, ['porte', 'cameras']);
  assert.deepEqual(m.securite.salles.reserve, ['blindage']);
  assert.deepEqual(m.personnel.employes.find((x) => x.role === 'gardien').affectation, ['s2']);
  assert.deepEqual(m.personnel.employes.find((x) => x.id === 'v').affectation, ['s2']);
});

/* ---------- Atelier ---------- */

test('atelier : une œuvre usée est réparée en vrai temps et retrouve sa place, ravivée', () => {
  let e = musee([{ id: 1, niveau: 2 }]);
  e = accrocher(e, 1, 's1', 0);
  e.oeuvres[1].usure = 0.5;
  e.oeuvres[1].joursExpo = 200;
  assert.throws(() => confierAtelier(cfg, e, { oeuvre: 1 }, 20000), /restaurateur/);
  e.personnel.employes.push({ id: 'r', nom: 'R', role: 'assistant', minutes: 0, efficacite: 1, salaire: 1 });
  const r = confierAtelier(cfg, e, { oeuvre: 1 }, 20000);
  const o = r.etat.oeuvres[1];
  assert.equal(o.lieu, 'atelier');
  assert.equal(o.travaux.type, 'reparation');
  // Remarquable : 1,5 × (0,5 + 1,5 × 0,5) / 0,9 = 2,08 → 3 jours.
  assert.equal(o.travaux.fin - 20000, 3);
  assert.throws(() => deplacer(cfg, r.etat, { oeuvre: 1, vers: { lieu: 'reserve' } }, 20001), /travaux/);
  assert.deepEqual(finirTravaux(cfg, r.etat, 20002, ramener), []);
  finirTravaux(cfg, r.etat, 20003, ramener);
  assert.equal(o.lieu, 'espace');
  assert.equal(o.espace, 's1');
  assert.equal(o.usure, 0);
  assert.ok(o.joursExpo < 200, 'ravivée : son attrait de nouveauté remonte');
});

test("usure : la foule use les œuvres exposées ; trop abîmée, une œuvre ne s'accroche plus", () => {
  let e = musee([{ id: 1 }, { id: 2 }]);
  e = accrocher(e, 1, 's1', 0);
  for (let d = 20000; d < 20010; d++) fermerJour(cfg, e, d, null);
  assert.ok(Math.abs(e.oeuvres[1].usure - 10 * cfg.usure.parJour) < 1e-9);
  assert.equal(e.oeuvres[2].usure, undefined, "en réserve, rien ne s'use");
  e.oeuvres[2].usure = cfg.usure.maxExposable;
  assert.throws(() => accrocher(e, 2, 's1', 1), /abîmée/);
});

test("collection privée : à l'abri des cambrioleurs, et un repos qui ravive", () => {
  let e = musee([{ id: 1, niveau: 3 }]);
  e = accrocher(e, 1, 's1', 0);
  e.oeuvres[1].joursExpo = 300;
  e = deplacer(cfg, e, { oeuvre: 1, vers: { lieu: 'privee' } }, 20000).etat;
  assert.equal(Object.values(risques(cfg, e, 20000)).reduce((t, x) => t + x.vol, 0), 0);
  e = deplacer(cfg, e, { oeuvre: 1, vers: { lieu: 'espace', espace: 's1', place: 0 } }, 20000 + cfg.atelier.reposPriveeJours).etat;
  assert.ok(e.oeuvres[1].joursExpo < 300);
});
