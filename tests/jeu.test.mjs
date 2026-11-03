// Orchestrateur et client du registre : les chemins où passent des Éclats.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJeu } from '../js/jeu.js';
import { createLocal } from '../js/donnees/local.js';
import { createRegistre } from '../js/donnees/registre.js';
import { tirerDansListe } from '../js/moteur/arrivages.js';
import { FORME_UUID } from '../js/moteur/alea.js';

function memoire() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

const catalogue = {
  musees: async () => [{ id: 1, nom: 'A', visiteurs: 1e6, prestige: 10 }],
  index: async (support, niveau) => Array.from({ length: 40 }, (_, i) => 100 * (niveau + 1) + i + (support === 'sculpture' ? 50 : 0)),
  fiche: async (id) => ({ id, titre: `Œuvre ${id}` }),
};

function monter({ horloge = () => Date.UTC(2026, 10, 3, 12) } = {}) {
  const storage = memoire();
  const backend = createLocal({ storage, catalogue, horlogeReelle: horloge, soldeInitial: 1000 });
  const jeu = createJeu({ backend, catalogue, storage });
  return { jeu, backend, storage };
}

test('création, achat payant puis offert : le solde ne bouge que pour l\'œuvre payante', async () => {
  const { jeu, backend } = monter();
  await jeu.creer('Essai');
  const a = jeu.etat.arrivages[0];
  await jeu.executer('acheter', { arrivage: a.id, oeuvre: a.oeuvres[1].id, fiche: { titre: 'Payée' } });
  assert.equal(await backend.solde(), 950);
  await jeu.executer('acheter', { arrivage: a.id, oeuvre: a.oeuvres[0].id, fiche: { titre: 'Offerte' } });
  assert.equal(await backend.solde(), 950);
  assert.equal(jeu.etat.eclats.length, 1);
  assert.equal(jeu.etat.eclats[0].montant, -50);
});

test('Éclats insuffisants : rien n\'est acquis, rien n\'est débité', async () => {
  const { jeu, backend } = monter();
  await jeu.creer('Essai');
  await jeu.executer('investir', { quoi: 'salle' });
  await jeu.executer('investir', { quoi: 'reserve' });
  const solde = await backend.solde();
  await assert.rejects(() => jeu.executer('investir', { quoi: 'aile' }), /insuffisants/);
  assert.equal(await backend.solde(), solde);
  assert.equal(jeu.etat.batiment.ailes, 1);
});

test('conflit de version : l\'action est rejouée sur l\'état relu, payée une seule fois', async () => {
  const { jeu, backend } = monter();
  await jeu.creer('Essai');
  // Une écriture concurrente (l'Edge Function de 4 h) fait avancer la version.
  const lu = await backend.chargerEtat();
  await backend.enregistrerEtat({ ...lu.etat, reputation: 77 }, lu.version);
  await jeu.executer('investir', { quoi: 'salle' });
  assert.equal(jeu.etat.reputation, 77, 'l\'écriture concurrente est conservée');
  assert.equal(jeu.etat.batiment.salles.length, 3);
  assert.equal(await backend.solde(), 500);
});

test('dépense interrompue avant l\'écriture de l\'état : reprise au chargement, sans second débit', async () => {
  const { jeu, backend, storage } = monter();
  await jeu.creer('Essai');
  const ecrire = backend.enregistrerEtat;
  backend.enregistrerEtat = async () => { throw new Error('Application fermée'); };
  await assert.rejects(() => jeu.executer('investir', { quoi: 'salle' }));
  assert.equal(await backend.solde(), 500, 'le registre a débité');
  backend.enregistrerEtat = ecrire;

  const jeu2 = createJeu({ backend, catalogue, storage });
  await jeu2.charger();
  assert.equal(jeu2.etat.batiment.salles.length, 3, 'la salle payée est livrée');
  assert.equal(await backend.solde(), 500, 'aucun second débit');
  const jeu3 = createJeu({ backend, catalogue, storage });
  await jeu3.charger();
  assert.equal(jeu3.etat.batiment.salles.length, 3, 'et pas deux fois');
});

test('session : un gain manqué se verse au chargement suivant, une seule fois', async () => {
  let t = Date.UTC(2026, 10, 3, 12);
  const { jeu, backend, storage } = monter({ horloge: () => t });
  await jeu.creer('Essai');
  const a = jeu.etat.arrivages[0];
  for (const o of a.oeuvres.slice(0, 3)) await jeu.executer('acheter', { arrivage: a.id, oeuvre: o.id, fiche: {} });
  const [o1, o2] = Object.keys(jeu.etat.oeuvres).map(Number);
  // Une œuvre restaurée exposée, pour que la session rapporte quelque chose.
  jeu.etat.oeuvres[o1].progression = 1;
  await jeu.executer('deplacer', { oeuvre: o1, vers: { lieu: 'espace', espace: 's1', place: 0 } });
  await jeu.executer('deplacer', { oeuvre: o2, vers: { lieu: 'atelier' } });
  await jeu.demarrerSession(o2, 120);
  t += 121 * 60e3;
  const recompenser = backend.recompenser;
  backend.recompenser = async () => { throw new TypeError('Réseau'); };
  await jeu.terminerSession();
  const avant = await backend.solde();
  const aVerser = jeu.etat.eclats.find((m) => m.montant > 0);
  assert.ok(aVerser && !aVerser.verse && aVerser.montant > 0);

  backend.recompenser = recompenser;
  const jeu2 = createJeu({ backend, catalogue, storage });
  await jeu2.charger();
  assert.equal(await backend.solde(), avant + aVerser.montant);
  assert.ok(jeu2.etat.eclats.find((m) => m.cle === aVerser.cle).verse);
  await jeu2.verser();
  assert.equal(await backend.solde(), avant + aVerser.montant);
});

test('registre : une dépense ajustée par le serveur est remboursée et refusée', async () => {
  const appels = [];
  const fetch = async (url, options) => {
    const corps = options.body ? JSON.parse(options.body) : null;
    appels.push({ url, corps });
    const repondre = (x) => new Response(JSON.stringify(x), { status: 200, headers: { date: new Date().toUTCString() } });
    if (url.endsWith('/eclats_balance')) return repondre(100);
    if (url.endsWith('/eclats_spend')) return repondre({ amount: 60, requested: 80, adjusted: true, idempotent_replay: false });
    if (url.endsWith('/eclats_refund')) return repondre({ amount: 60 });
    throw new Error(url);
  };
  const storage = memoire();
  storage.setItem('eclats_session', JSON.stringify({ access_token: 'x', user: { id: 'u' } }));
  const r = createRegistre({ fetch, storage });
  await assert.rejects(() => r.depenser({ montant: 80, cle: 'musee:essai:12345678', motif: 'Essai', type: 'essai' }), /insuffisants/);
  const spend = appels.find((a) => a.url.endsWith('/eclats_spend')).corps;
  const refund = appels.find((a) => a.url.endsWith('/eclats_refund')).corps;
  assert.match(spend.p_reference_id, FORME_UUID);
  assert.equal(refund.p_reference_id, spend.p_reference_id);
  assert.equal(spend.p_app_id, 'musee');
});

test('registre : la référence d\'un gain n\'est transmise que si c\'est un uuid', async () => {
  const appels = [];
  const fetch = async (url, options) => {
    appels.push(JSON.parse(options.body));
    return new Response('{}', { status: 200 });
  };
  const storage = memoire();
  storage.setItem('eclats_session', JSON.stringify({ access_token: 'x', user: { id: 'u' } }));
  const r = createRegistre({ fetch, storage });
  await r.recompenser({ montant: 5, cle: 'musee:pret:p20000', motif: 'Prêt', referenceId: 'p20000' });
  await r.recompenser({ montant: 5, cle: 'musee:session:x', motif: 'Session', referenceId: '11111111-1111-4111-8111-111111111111' });
  assert.equal(appels[0].p_reference_id, null);
  assert.equal(appels[1].p_reference_id, '11111111-1111-4111-8111-111111111111');
});

test('le tirage local suit la règle du serveur', async () => {
  const ids = await catalogue.index('peinture', 0);
  const id = tirerDansListe(ids, 12345, new Set());
  assert.ok(ids.includes(id));
  assert.notEqual(tirerDansListe(ids, 12345, new Set([id])), id);
});

test('reprise d\'une dépense déjà débitée : pas de contrôle de solde qui la refuserait', async () => {
  const appels = [];
  const fetch = async (url, options) => {
    appels.push(url);
    if (url.endsWith('/eclats_balance')) return new Response('10', { status: 200 });
    if (url.endsWith('/eclats_spend')) return new Response(JSON.stringify({ amount: 50, adjusted: false, idempotent_replay: true }), { status: 200 });
    throw new Error(url);
  };
  const storage = memoire();
  storage.setItem('eclats_session', JSON.stringify({ access_token: 'x', user: { id: 'u' } }));
  const r = createRegistre({ fetch, storage });
  await assert.rejects(() => r.depenser({ montant: 50, cle: 'musee:achat:a1:1:abcd', motif: 'x' }), /insuffisants/);
  const rejoue = await r.depenser({ montant: 50, cle: 'musee:achat:a1:1:abcd', motif: 'x', reprise: true });
  assert.equal(rejoue.idempotent_replay, true);
});

test('mise à jour mensuelle : le niveau suit le catalogue, la progression reste en pourcentage', async () => {
  const { jeu } = monter();
  await jeu.creer('Essai');
  const a = jeu.etat.arrivages[0];
  await jeu.executer('acheter', { arrivage: a.id, oeuvre: a.oeuvres[0].id, fiche: {} });
  const id = a.oeuvres[0].id;
  jeu.etat.oeuvres[id].progression = 0.4;
  const r = await jeu.executer('ajusterNiveaux', { niveaux: { [id]: 2 } });
  assert.equal(r.etat.oeuvres[id].niveau, 2);
  assert.equal(r.etat.oeuvres[id].progression, 0.4);
});
