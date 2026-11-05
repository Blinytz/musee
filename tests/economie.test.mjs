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
import {
  deplacer, demarrerSession, terminerSession, embaucher, licencier, investir, lancerCampagne, coutCampagne, ouvrirExposition,
} from '../js/moteur/actions.js';
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
  e.personnel.employes = [{ id: 'a', nom: 'a', role: 'veilleur', minutes: 0, efficacite: 1.2, salaire: 0.9 }];
  e.statut = 1;
  assert.ok(Math.abs(effetsPersonnel(cfg, e).menaces.nuit - 6 * 1.2) < 1e-9);
  assert.ok(Math.abs(salaireHoraire(cfg, e, { role: 'veilleur', niveau: 1, salaire: 0.9 }) - 0.5 * 2 * 0.9) < 1e-9);
  // Un employé d'avant les profils garde exactement ses chiffres.
  e.personnel.employes = [{ id: 'b', nom: 'b', role: 'veilleur', minutes: 0 }];
  assert.equal(effetsPersonnel(cfg, e).menaces.nuit, 6);
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

function employe(e, role, minutes = 0) {
  e.personnel.employes.push({ id: `${role}${e.personnel.employes.length}`, nom: role, role, minutes });
}

test('trois menaces : risque pondéré par l\'emplacement, protection par métier et matériel', () => {
  let e = musee([{ id: 1, niveau: 2 }, { id: 2, niveau: 2, lieu: 'reserve' }]);
  e = accrocher(e, 1, 's1', 0);
  const r = risques(cfg, e, 20000);
  assert.equal(r.nuit, 8 + 8 * 0.6);
  assert.ok(r.jour > 0);
  assert.ok(Math.abs(r.vandalisme - 8 ** 1.5 / 10) < 1e-9);
  // Le gardien de départ, niveau 1 : cambriolage 1, vol en salle 3.
  assert.deepEqual(protections(cfg, e), { nuit: 1, jour: 3, vandalisme: 0 });
  e = investir(cfg, e, { quoi: 'inv:serrures' }).etat;
  assert.equal(protections(cfg, e).nuit, 6);
  assert.ok(Math.abs(probabilites(cfg, e, 20000).nuit - 0.03 * 12.8 / (6 + 5)) < 1e-12);
});

test('le matériel ne vaut que par ceux qui le servent', () => {
  const e = musee();
  e.statut = 4;
  e.investissements = ['alarme', 'video', 'drones'];
  const seul = protections(cfg, e).nuit;
  // Vidéo à moitié sans opérateur, drones au sol sans pilote.
  assert.equal(seul, 1 + 20 + 15);
  employe(e, 'operateur');
  employe(e, 'pilote');
  assert.equal(protections(cfg, e).nuit, 1 + 20 + 30 + 120 + 4 + 25);
  employe(e, 'technicien');
  const technicien = protections(cfg, e).nuit;
  assert.ok(Math.abs(technicien - (1 + 4 + 25 + (20 + 30 + 120) * 1.13)) < 1e-9);
});

test('le chef de la sécurité renforce toute la protection humaine', () => {
  const e = musee();
  e.statut = 3;
  employe(e, 'veilleur');
  const avant = protections(cfg, e).nuit;
  employe(e, 'chefSecurite');
  assert.ok(Math.abs(protections(cfg, e).nuit - avant * 1.13) < 1e-9);
});

test('certains métiers ne s\'ouvrent qu\'avec leur matériel', () => {
  const e = musee();
  e.statut = 4;
  const ids = () => rolesOuverts(cfg, e).map((r) => r.id);
  assert.ok(!ids().includes('pilote'));
  assert.ok(!ids().includes('operateur'));
  e.investissements = ['video', 'drones'];
  assert.ok(ids().includes('pilote'));
  assert.ok(ids().includes('operateur'));
});

test('cambriolage, vol en salle et vandalisme : reproductibles et lourds de conséquences', () => {
  let e = musee([{ id: 1, niveau: 3 }, { id: 2, niveau: 3, support: 'sculpture' }]);
  e = accrocher(e, 1, 's1', 0);
  e = accrocher(e, 2, 's1', 1);
  e.personnel.employes = [];
  const rep = e.reputation;
  const faits = [];
  for (let j = 20000; j < 20700 && faits.length < 2; j += 7) faits.push(...tirages(cfg, e, j));
  assert.ok(faits.length >= 1);
  assert.ok(e.reputation < rep, 'la réputation baisse');
  assert.ok(e.bonusPermanents < 0, 'la confiance aussi, durablement');
  for (const f of faits) {
    const o = e.oeuvres[f.oeuvre];
    if (f.type === 'vandalisme') {
      assert.equal(o.lieu, 'reserve');
      assert.ok(o.progression <= 0.85 && o.progression >= 0.6);
    } else {
      assert.equal(o.lieu, 'volee');
    }
  }
});

test('enquête : l\'œuvre retrouvée revient abîmée, sinon elle est perdue après 26 semaines', () => {
  const e = musee([{ id: 1, niveau: 3, lieu: 'volee', voleeLe: 20000 }, { id: 2, niveau: 1, lieu: 'volee', voleeLe: 20000 }]);
  const retrouve = configEffective({ securite: { enquete: 1 } });
  enquete(retrouve, e, 20007);
  assert.equal(e.oeuvres[1].lieu, 'reserve');
  assert.ok(Math.abs(e.oeuvres[1].progression - 0.8) < 1e-12);
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
  e.investissements = ['securite1', 'securite2', 'vitrines', 'portiques'];
  for (let i = 0; i < 6; i++) employe(e, 'surete', 400 * 60);
  for (let i = 0; i < 4; i++) employe(e, 'veilleur', 400 * 60);
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
  assert.equal(m.format, 3);
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

test('un matériel qui ouvre un métier amène aussitôt un premier candidat', () => {
  const e = musee();
  e.statut = 2;
  const r = investir(cfg, e, { quoi: 'inv:video' }, 20000);
  const c = r.etat.personnel.candidats.at(-1);
  assert.equal(c.role, 'operateur');
  assert.equal(c.expire, 20007);
  assert.ok(embaucher(cfg, r.etat, { candidat: c.id }, 20000).etat.personnel.employes.some((x) => x.role === 'operateur'));
});
