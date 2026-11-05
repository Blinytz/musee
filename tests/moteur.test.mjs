import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG, configEffective } from '../js/config.js';
import { jourDe, debutDuJour, jourSemaine } from '../js/moteur/temps.js';
import {
  nouveaute, facteurPrix, travailEffectif, prixArrivage, siecle, niveauMaitrise,
  frequentationAnnualisee, joursPourNouveaute,
} from '../js/moteur/regles.js';
import { rangTirage, tirerDansListe, tirerArrivage, poidsNiveaux } from '../js/moteur/arrivages.js';
import { creerEtat } from '../js/moteur/etat.js';
import {
  acheter, deplacer, demarrerSession, terminerSession, resultatSession, investir,
  accepterPret, ouvrirExposition, lancerCampagne, ErreurJeu,
} from '../js/moteur/actions.js';
import { avancer, fermerJour, ouvrirJour, creerMusee } from '../js/moteur/journee.js';
import { visiteursDuJour } from '../js/moteur/visiteurs.js';
import { refusAccrochage, espacesPublics } from '../js/moteur/batiment.js';
import { avancerChantiers } from '../js/moteur/charges.js';

const cfg = configEffective({});
const T = cfg.temps;
// Pour les scénarios longs : sans cambriolage, une œuvre ne disparaît pas.
const cfgSansVol = configEffective({ securite: { menaces: { vol: { max: 0, min: 0 }, vandalisme: { max: 0, min: 0 } } } });

function etatAvec(oeuvres = [], options = {}) {
  const etat = creerEtat(cfg, { nom: 'Test', jour: 20000, graine: 'g' });
  for (const o of oeuvres) {
    etat.oeuvres[o.id] = {
      titre: `Œuvre ${o.id}`, support: 'peinture', niveau: 0, lieu: 'reserve', progression: 0,
      acquiseLe: 20000, restaureeLe: null, joursExpo: 0, sortieLe: null, minutes: 0, ...o,
    };
  }
  return Object.assign(etat, options);
}

const tirerFactice = async ({ niveau, support, graine, exclus }) => {
  const ids = Array.from({ length: 50 }, (_, i) => 1000 * (niveau + 1) + i + (support === 'sculpture' ? 500 : 0));
  return tirerDansListe(ids, graine, exclus);
};

/* ---------- Temps ---------- */

test('le jour de jeu bascule à 4 h, heure de Paris, été comme hiver', () => {
  // 15 janvier 2026 : UTC+1. 2 h 59 UTC = 3 h 59 Paris → veille.
  const hiver = jourDe(Date.UTC(2026, 0, 15, 2, 59), T);
  assert.equal(jourDe(Date.UTC(2026, 0, 15, 3, 0), T), hiver + 1);
  // 15 juillet 2026 : UTC+2. 1 h 59 UTC = 3 h 59 Paris → veille.
  const ete = jourDe(Date.UTC(2026, 6, 15, 1, 59), T);
  assert.equal(jourDe(Date.UTC(2026, 6, 15, 2, 0), T), ete + 1);
  assert.equal(debutDuJour(ete + 1, T), Date.UTC(2026, 6, 15, 2, 0));
  assert.equal(debutDuJour(hiver + 1, T), Date.UTC(2026, 0, 15, 3, 0));
});

test('jourSemaine : le 3 novembre 2026 est un mardi', () => {
  assert.equal(jourSemaine(jourDe(Date.UTC(2026, 10, 3, 12), T)), 2);
});

/* ---------- Règles ---------- */

test('nouveauté : ×2 → ×1 en 30 jours, plateau jusqu\'à 180, -0,05 par 30 jours, plancher 0,7', () => {
  assert.equal(nouveaute(cfg, 0), 2);
  assert.equal(nouveaute(cfg, 15), 1.5);
  assert.equal(nouveaute(cfg, 30), 1);
  assert.equal(nouveaute(cfg, 180), 1);
  assert.equal(nouveaute(cfg, 209), 1);
  assert.equal(nouveaute(cfg, 210), 0.95);
  assert.equal(nouveaute(cfg, 5000), 0.7);
  assert.equal(joursPourNouveaute(cfg, 1.5), 15);
});

test('facteur prix : billet à 1 neutre, gratuit attire davantage', () => {
  assert.equal(facteurPrix(cfg, 1, 60), 1);
  assert.ok(facteurPrix(cfg, 0, 60) > 1);
  assert.ok(Math.abs(facteurPrix(cfg, 5, 60) - Math.exp(-4 / 4)) < 1e-12);
});

test('travail effectif : 7 h donnent 7 × 1,25 heures de travail, bonus compris', () => {
  assert.equal(travailEffectif(cfg, 420, 0), 525);
  assert.ok(Math.abs(travailEffectif(cfg, 60, 0.1) - 60 * (1 + 0.25 / 7) * 1.1) < 1e-9);
});

test('prix d\'arrivage : barème et remises de documentation', () => {
  const e = etatAvec();
  assert.deepEqual(cfg.niveaux.map((n) => prixArrivage(cfg, e, n.id)), [50, 210, 750, 2450, 8000, 34000]);
  e.investissements = ['bibliotheque'];
  assert.equal(prixArrivage(cfg, e, 2), 675);
  e.investissements = ['bibliotheque', 'archives'];
  assert.equal(prixArrivage(cfg, e, 2), 600);
});

test('siècle et maîtrise', () => {
  assert.equal(siecle(1503), 16);
  assert.equal(siecle(1500), 15);
  assert.equal(siecle(-450), -5);
  assert.equal(niveauMaitrise(cfg, 0), 1);
  assert.equal(niveauMaitrise(cfg, 5 * 60), 2);
  assert.equal(niveauMaitrise(cfg, 650 * 60), 10);
});

test('fréquentation annualisée : moyenne des 7 derniers jours × 365', () => {
  const h = [10, 10, 10, 10, 10, 10, 10, 80].map((v) => ({ visiteurs: v }));
  assert.equal(frequentationAnnualisee(cfg, h), 20 * 365);
});

/* ---------- Tirages ---------- */

test('rangTirage est l\'empreinte entière documentée dans schema.sql', () => {
  // (id XOR graine) × 2654435761 mod 2^32, calculé indépendamment en BigInt.
  for (const [id, g] of [[1, 0], [123456, 987654321], [2 ** 30, 4294967295]]) {
    const attendu = Number(((BigInt((id ^ g) >>> 0)) * 2654435761n) % 4294967296n);
    assert.equal(rangTirage(id, g), attendu);
  }
});

test('un arrivage est reproductible et n\'offre jamais une œuvre possédée', async () => {
  const e = etatAvec([{ id: 1000 }]);
  const a1 = await tirerArrivage(cfg, e, 20005, tirerFactice);
  const a2 = await tirerArrivage(cfg, e, 20005, tirerFactice);
  assert.deepEqual(a1, a2);
  assert.equal(a1.oeuvres.length, 5);
  assert.ok(a1.oeuvres.every((o) => o.id !== 1000));
  assert.equal(new Set(a1.oeuvres.map((o) => o.id)).size, 5);
  assert.ok(a1.oeuvres.every((o) => o.niveau <= 1 && ['peinture', 'sculpture'].includes(o.support)));
});

test('pondération des niveaux : le plus haut pèse 1, le précédent 2…', () => {
  const e = etatAvec([], { statut: 5 });
  assert.deepEqual(poidsNiveaux(cfg, e), [[0, 6], [1, 5], [2, 4], [3, 3], [4, 2], [5, 1]]);
});

test('premier arrivage : cinq Mineures, la première offerte', async () => {
  const e = await creerMusee(cfg, { nom: 'M', jour: 20000, graine: 'x' }, { tirer: tirerFactice });
  const a = e.arrivages[0];
  assert.equal(a.oeuvres.length, 5);
  assert.ok(a.oeuvres.every((o) => o.niveau === 0));
  assert.deepEqual(a.oeuvres.map((o) => o.offerte), [true, false, false, false, false]);
  const r = acheter(cfg, e, { arrivage: a.id, oeuvre: a.oeuvres[0].id, fiche: { titre: 'Offerte' } }, 20000);
  assert.equal(r.depense, null);
  const r2 = acheter(cfg, r.etat, { arrivage: a.id, oeuvre: a.oeuvres[1].id, fiche: { titre: 'Payée' } }, 20000);
  assert.equal(r2.depense.montant, 50);
  assert.match(r2.depense.cle, /^musee:achat:/);
});

test('réserve pleine : impossible d\'acquérir', async () => {
  const e = await creerMusee(cfg, { nom: 'M', jour: 20000, graine: 'x' }, { tirer: tirerFactice });
  for (let i = 0; i < 10; i++) e.oeuvres[90 + i] = { id: 90 + i, lieu: 'reserve', progression: 0, niveau: 0, support: 'peinture' };
  const a = e.arrivages[0];
  assert.throws(() => acheter(cfg, e, { arrivage: a.id, oeuvre: a.oeuvres[0].id, fiche: {} }, 20000), /Réserve pleine/);
});

/* ---------- Accrochage ---------- */

test('accrochage : 100 % requis, estampes au cabinet, sécurité pour les chefs-d\'œuvre', () => {
  const e = etatAvec([
    { id: 1, progression: 1 },
    { id: 2, progression: 0.99 },
    { id: 3, progression: 1, support: 'estampe' },
    { id: 4, progression: 1, niveau: 4 },
  ]);
  assert.equal(refusAccrochage(cfg, e, e.oeuvres[1], 's1'), null);
  assert.match(refusAccrochage(cfg, e, e.oeuvres[2], 's1'), /inachevée/);
  assert.match(refusAccrochage(cfg, e, e.oeuvres[3], 's1'), /cabinet/);
  assert.match(refusAccrochage(cfg, e, e.oeuvres[4], 's1'), /Sécurité niveau 1/);
});

test('déposer sur une place occupée échange les deux œuvres', () => {
  let e = etatAvec([{ id: 1, progression: 1 }, { id: 2, progression: 1 }]);
  e = deplacer(cfg, e, { oeuvre: 1, vers: { lieu: 'espace', espace: 's1', place: 0 } }, 20000).etat;
  e = deplacer(cfg, e, { oeuvre: 2, vers: { lieu: 'espace', espace: 's2', place: 3 } }, 20000).etat;
  e = deplacer(cfg, e, { oeuvre: 2, vers: { lieu: 'espace', espace: 's1', place: 0 } }, 20000).etat;
  assert.equal(e.oeuvres[2].espace, 's1');
  assert.equal(e.oeuvres[1].espace, 's2');
  assert.equal(e.oeuvres[1].place, 3);
});

test('une œuvre absente des salles 30 jours repart de ×2', () => {
  let e = etatAvec([{ id: 1, progression: 1, joursExpo: 100 }]);
  e = deplacer(cfg, e, { oeuvre: 1, vers: { lieu: 'espace', espace: 's1', place: 0 } }, 20000).etat;
  e = deplacer(cfg, e, { oeuvre: 1, vers: { lieu: 'reserve' } }, 20000).etat;
  const tot = deplacer(cfg, e, { oeuvre: 1, vers: { lieu: 'espace', espace: 's1', place: 0 } }, 20029).etat;
  assert.equal(tot.oeuvres[1].joursExpo, 100);
  const tard = deplacer(cfg, e, { oeuvre: 1, vers: { lieu: 'espace', espace: 's1', place: 0 } }, 20030).etat;
  assert.equal(tard.oeuvres[1].joursExpo, 0);
});

/* ---------- Sessions ---------- */

function enSession(etat, dureeMin, debut = 0) {
  return demarrerSession(cfg, etat, { id: '11111111-1111-4111-8111-111111111111', oeuvre: 1, dureeMin, debut }, 20000).etat;
}

test('session : maîtrise requise, durée bornée', () => {
  const e = etatAvec([{ id: 1, lieu: 'atelier', niveau: 1 }]);
  assert.throws(() => enSession(e, 60), /Maîtrise 2 requise/);
  const e2 = etatAvec([{ id: 1, lieu: 'atelier' }]);
  assert.throws(() => enSession(e2, 9), ErreurJeu);
  assert.throws(() => enSession(e2, 421), ErreurJeu);
});

test('arrêt anticipé : rien ne compte sous 10 minutes', () => {
  const e = enSession(etatAvec([{ id: 1, lieu: 'atelier' }]), 60);
  assert.equal(resultatSession(cfg, e.session, 9 * 60e3 + 59e3).minutes, 0);
  assert.equal(resultatSession(cfg, e.session, 10 * 60e3).minutes, 10);
  assert.equal(resultatSession(cfg, e.session, 5 * 3600e3).minutes, 60);
});

test('session achevée : progression, surplus perdu, maîtrise, charges en clair', () => {
  let e = etatAvec([{ id: 1, lieu: 'atelier', progression: 0.5 }]);
  e.session = null;
  e = enSession(e, 120);
  e.session.figes.tauxHoraire = 10.7;
  e.session.figes.salaireHoraire = 0.5;
  e.session.figes.charges = { accueil: 2, entretien: 1.5, assurance: 0, fournitures: 0.25 };
  const r = terminerSession(cfg, e, 120 * 60e3, 20000);
  assert.equal(r.etat.oeuvres[1].progression, 1);
  assert.equal(r.etat.oeuvres[1].restaureeLe, 20000);
  assert.ok(Math.abs(r.resultat.perdu - (120 * (1 + 0.25 * 120 / 420) - 60)) < 1e-9);
  assert.equal(r.etat.maitrise.peinture, 120);
  // Recettes 21, salaires 1, accueil 4, entretien 3, fournitures 1 (0,5
  // arrondi), aucun impôt sous 100 ✦/h : 12 tout rond.
  const f = r.resultat.finances;
  assert.deepEqual([f.recettes, f.salaires, f.accueil, f.entretien, f.assurance, f.fournitures, f.impot], [21, 1, 4, 3, 0, 1, 0]);
  assert.equal(r.resultat.eclats, 12);
  assert.equal(r.gain.cle, 'musee:session:11111111-1111-4111-8111-111111111111');
});

/* ---------- Journées ---------- */

test('avancer en une fois ou jour par jour donne le même état', async () => {
  let base = etatAvec([{ id: 1, progression: 1 }, { id: 2, progression: 1, niveau: 1 }]);
  base = deplacer(cfg, base, { oeuvre: 1, vers: { lieu: 'espace', espace: 's1', place: 0 } }, 20000).etat;
  base = deplacer(cfg, base, { oeuvre: 2, vers: { lieu: 'espace', espace: 's1', place: 1 } }, 20000).etat;
  const ctx = { musees: [{ id: 1, nom: 'A', visiteurs: 30000, prestige: 10 }, { id: 2, nom: 'B', visiteurs: 100, prestige: 1 }], tirer: tirerFactice };
  const d1 = await avancer(cfg, base, 20020, ctx);
  let d2 = base;
  for (let j = 20001; j <= 20020; j++) d2 = await avancer(cfg, d2, j, ctx);
  assert.deepEqual(d1, d2);
  assert.equal(d1.historique.length, 20);
  assert.ok(d1.arrivages.length >= 1);
});

test('visiteurs : 10 × prestige × nouveauté × (0,5 + réputation / 100)', () => {
  let e = etatAvec([{ id: 1, progression: 1, niveau: 1 }]);
  e = deplacer(cfg, e, { oeuvre: 1, vers: { lieu: 'espace', espace: 's1', place: 0 } }, 20000).etat;
  e.reputation = 60;
  assert.equal(visiteursDuJour(cfg, e, 20000), Math.round(10 * 3 * 2 * 1.1));
  e.batiment.salles[0].theme = { type: 'support', valeur: 'peinture' };
  assert.equal(visiteursDuJour(cfg, e, 20000), Math.round(10 * 3 * 2 * 1.25 * 1.1));
  e.batiment.salles[0].theme = { type: 'support', valeur: 'sculpture' };
  assert.equal(visiteursDuJour(cfg, e, 20000), Math.round(10 * 3 * 2 * 0.8 * 1.1));
});

test('passage de statut : définitif, +5 de réputation', async () => {
  let e = etatAvec([{ id: 1, progression: 1, niveau: 2 }]);
  e = deplacer(cfg, e, { oeuvre: 1, vers: { lieu: 'espace', espace: 's1', place: 0 } }, 20000).etat;
  const r0 = e.reputation;
  fermerJour(cfg, e, 20000, {});
  assert.equal(e.statut, 1);
  assert.ok(e.reputation > r0 + 4);
  assert.equal(e.bonusPermanents, 5);
  e.oeuvres = {};
  for (let j = 20001; j < 20010; j++) fermerJour(cfg, e, j, {});
  assert.equal(e.statut, 1);
});

test('prêt : accepté, rémunéré, rendu avec une nouveauté de ×1,5', async () => {
  let e = etatAvec([{ id: 1, progression: 1, niveau: 2, joursExpo: 300 }], { statut: 2 });
  e = deplacer(cfg, e, { oeuvre: 1, vers: { lieu: 'espace', espace: 's1', place: 0 } }, 20000).etat;
  e.prets.demande = { id: 'p20000', jour: 20000, expire: 20002, musee: 7, museeNom: 'Musée X', oeuvre: 1, niveau: 2, duree: 14, remuneration: 450 };
  const r = accepterPret(cfg, e, null, 20000);
  assert.equal(r.gain.montant, 450);
  assert.equal(r.etat.oeuvres[1].lieu, 'pret');
  assert.equal(r.etat.bonusPermanents, 1);
  const rendu = await avancer(cfgSansVol, r.etat, 20015, { musees: [], tirer: tirerFactice });
  assert.equal(rendu.oeuvres[1].lieu, 'espace');
  assert.equal(rendu.oeuvres[1].espace, 's1');
  assert.equal(nouveaute(cfg, rendu.oeuvres[1].joursExpo - 1), 1.5);
});

test('exposition : thème, emprunts plafonnés, bilan de réputation, retour en salle', async () => {
  const oeuvres = [];
  for (let i = 1; i <= 4; i++) oeuvres.push({ id: i, progression: 1, niveau: 2, an: 1650 });
  let e = etatAvec(oeuvres, { statut: 3 });
  e.batiment.exposition = { nom: 'Expo', places: 15 };
  e.personnel.employes.push({ id: 'g2', nom: 'B', role: 'gardien', minutes: 0 });
  for (let i = 1; i <= 4; i++) e = deplacer(cfg, e, { oeuvre: i, vers: { lieu: 'espace', espace: 's1', place: i - 1 } }, 20000).etat;
  const musees = [{ id: 9, nom: 'Grand', visiteurs: 10_000_000, prestige: 1 }];
  const theme = { type: 'siecle', valeur: 17, libelle: 'XVIIe siècle' };
  const emprunt = (id) => ({ id, titre: `E${id}`, niveau: 3, support: 'peinture', an: 1620, musee: 9 });
  assert.throws(() => ouvrirExposition(cfg, e, { id: 'x', theme, oeuvres: [1, 2], emprunts: [emprunt(100), emprunt(101), emprunt(102), emprunt(103)] }, 20000, musees), /Trop d'emprunts/);
  // Les prêteurs exigent un musée sûr : ici, sans menace, ils prêtent.
  const r = ouvrirExposition(cfgSansVol, e, { id: 'x', theme, oeuvres: [1, 2, 3], emprunts: [emprunt(100), emprunt(101), emprunt(102)] }, 20000, musees);
  assert.equal(r.depense.montant, 3 * 1225);
  const fin = await avancer(cfgSansVol, r.etat, 20022, { musees, tirer: tirerFactice });
  assert.equal(fin.expositions.courante, null);
  assert.ok(fin.expositions.historique[0].visiteurs > 0);
  assert.ok([1, 2, 3].every((i) => fin.oeuvres[i].lieu === 'espace' && fin.oeuvres[i].espace === 's1'));
});

test('campagnes : une à la fois, 30 jours entre deux', () => {
  const e = etatAvec();
  e.historique.push({ jour: 19999, visiteurs: 100 });
  const r = lancerCampagne(cfg, e, { id: 'affichage' }, 20000);
  assert.equal(r.depense.montant, 300);
  assert.throws(() => lancerCampagne(cfg, r.etat, { id: 'affichage' }, 20003), /en cours/);
  assert.throws(() => lancerCampagne(cfg, r.etat, { id: 'affichage' }, 20036), /Délai/);
  assert.ok(lancerCampagne(cfg, r.etat, { id: 'affichage' }, 20037));
});

test('investissements : prix progressifs du bâtiment', () => {
  let e = etatAvec();
  const prix = [];
  for (let i = 0; i < 2; i++) { const r = investir(cfg, e, { quoi: 'salle' }); prix.push(r.depense.montant); e = r.etat; }
  assert.deepEqual(prix, [500, 675]);
  assert.throws(() => investir(cfg, e, { quoi: 'salle' }), /ailes sont pleines/);
  const aile = investir(cfg, e, { quoi: 'aile' });
  assert.equal(aile.depense.montant, 5000);
  assert.throws(() => investir(cfg, aile.etat, { quoi: 'aile' }), /déjà en chantier/);
  const livree = structuredClone(aile.etat);
  avancerChantiers(cfg, livree, 600 * 60, 20000);
  assert.equal(livree.batiment.ailes, 2);
  assert.equal(investir(cfg, livree, { quoi: 'aile' }).depense.montant, 12500);
  // Un agrandissement à la fois par salle : on attend la fin du chantier.
  assert.deepEqual([0, 1, 2].reduce((acc) => {
    const r = investir(cfg, acc.e, { quoi: 'agrandir:s1' });
    avancerChantiers(cfg, r.etat, 120 * 60, 20000);
    return { e: r.etat, p: [...acc.p, r.depense.montant] };
  }, { e: livree, p: [] }).p, [400, 1200, 3600]);
});

test('chantiers : une salle payée sort de terre pendant les sessions, un chantier à la fois', () => {
  const e = investir(cfg, etatAvec(), { quoi: 'salle' }).etat;
  assert.equal(espacesPublics(e).length, 2, 'la salle en chantier n\'accueille personne');
  assert.equal(e.chantiers.length, 1);
  avancerChantiers(cfg, e, 3 * 60, 20000);
  assert.equal(espacesPublics(e).length, 2);
  assert.equal(e.chantiers[0].fait, 3);
  avancerChantiers(cfg, e, 60, 20001);
  assert.equal(espacesPublics(e).length, 3);
  assert.equal(e.chantiers.length, 0);
  assert.ok(e.evenements.some((x) => x.type === 'chantier'));
});

test('surcharges de réglages : un prix change sans effacer le reste du niveau', () => {
  const c = configEffective({ niveaux: { 2: { prix: 999 } } });
  assert.equal(c.niveaux[2].prix, 999);
  assert.equal(c.niveaux[2].prestige, 8);
  assert.equal(CONFIG.niveaux[2].prix, 750);
});

test('la formule SQL de musee_rang (multiplication découpée) égale rangTirage', () => {
  // Réplique en BigInt de l'expression écrite dans supabase/schema.sql.
  const sql = (id, g) => {
    const x = (BigInt(id) ^ BigInt(g)) & 4294967295n;
    return Number(((((x >> 16n) * 2654435761n) % 4294967296n) * 65536n + ((x & 65535n) * 2654435761n)) % 4294967296n);
  };
  for (const [id, g] of [[1, 0], [17, 3735928559], [123456, 987654321], [2147483647, 4294967295], [42, 2654435761]]) {
    assert.equal(sql(id, g), rangTirage(id, g));
  }
});
