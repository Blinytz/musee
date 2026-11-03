// L'Edge Function, jouée dans Node contre une fausse base PostgREST et un
// faux service de notifications.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configEffective } from '../js/config.js';
import { creerEtat } from '../js/moteur/etat.js';
import { jourDe } from '../js/moteur/temps.js';
import { b64 } from '../supabase/source/webpush.js';

const cfg = configEffective({});
process.env.SUPABASE_URL = 'https://base.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
process.env.MUSEE_CLE_CRON = 'secret-cron';
process.env.MUSEE_URL_CATALOGUE = 'https://pages.test/catalogue/';

const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
process.env.MUSEE_VAPID_PUBLIQUE = b64(await crypto.subtle.exportKey('raw', vapid.publicKey));
process.env.MUSEE_VAPID_PRIVEE = (await crypto.subtle.exportKey('jwk', vapid.privateKey)).d;

const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const abonnement = {
  endpoint: 'https://push.test/abonnement',
  p256dh: b64(await crypto.subtle.exportKey('raw', ua.publicKey)),
  auth: b64(crypto.getRandomValues(new Uint8Array(16))),
};

const { traiter } = await import('../supabase/source/musee.js');

function fausseBase(etatInitial, { version = 3, sessions = [] } = {}) {
  const journal = { patchs: [], pushs: [], tirages: 0, sessionsMarquees: [] };
  let versionCourante = version;
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    const repondre = (corps, statut = 200) => new Response(corps === null ? '' : JSON.stringify(corps), { status: statut });
    if (u.startsWith('https://pages.test/')) return repondre([{ id: 1, nom: 'Louvre', visiteurs: 8_700_000, prestige: 500 }]);
    if (u.startsWith('https://push.test/')) {
      journal.pushs.push({ entetes: options.headers, taille: options.body.length });
      return new Response('', { status: 201 });
    }
    assert.equal(options.headers.Authorization, 'Bearer service');
    if (u.includes('/rpc/musee_tirer')) { journal.tirages++; return repondre(1000 + journal.tirages); }
    if (u.includes('musee_etats?select=user_id,etat,version')) return repondre([{ user_id: 'u1', etat: etatInitial, version: versionCourante }]);
    if (u.includes('musee_etats?user_id=eq.u1&version=eq.') && options.method === 'PATCH') {
      const attendue = Number(u.match(/version=eq\.(\d+)/)[1]);
      if (attendue !== versionCourante) return repondre([]);
      const corps = JSON.parse(options.body);
      journal.patchs.push(corps);
      versionCourante = corps.version;
      return repondre([{ version: versionCourante }]);
    }
    if (u.includes('musee_abonnements?select')) return repondre([abonnement]);
    if (u.includes('musee_sessions?select')) return repondre(sessions);
    if (u.includes('musee_sessions?id=in.') && options.method === 'PATCH') { journal.sessionsMarquees.push(u); return repondre(null); }
    if (u.includes('musee_etats?select=etat->reglages')) return repondre([{ reglages: etatInitial.reglages }]);
    throw new Error(`Requête inattendue ${options.method || 'GET'} ${u}`);
  };
  return journal;
}

const requete = (type, cle = 'secret-cron') => new Request('https://fn.test', {
  method: 'POST', headers: { 'x-musee-cle': cle, 'Content-Type': 'application/json' }, body: JSON.stringify({ type }),
});

test('refuse un appel sans la clé de pg_cron', async () => {
  const r = await traiter(requete('quotidien', 'mauvaise'));
  assert.equal(r.status, 401);
});

test('quotidien : rattrape les jours, écrit sur la bonne version, notifie l\'arrivage', async () => {
  const aujourdhui = jourDe(Date.now(), cfg.temps);
  const etat = creerEtat(cfg, { nom: 'Essai', jour: aujourdhui - 9, graine: 'g' });
  const journal = fausseBase(etat);
  const r = await traiter(requete('quotidien'));
  assert.equal(r.status, 200);
  assert.equal(journal.patchs.length, 1);
  const ecrit = journal.patchs[0];
  assert.equal(ecrit.version, 4);
  assert.equal(ecrit.etat.jourFerme, aujourdhui - 1);
  assert.equal(ecrit.etat.historique.length, 9);
  assert.ok(ecrit.etat.arrivages.length >= 1, 'un lundi est passé : arrivage tiré');
  assert.ok(journal.tirages >= 5);
  assert.ok(ecrit.etat.evenements.every((e) => e.notifie));
  // Seuls les événements de la veille ou du jour partent, pas ceux d'il y a une semaine.
  const recents = ecrit.etat.evenements.filter((e) => e.jour >= aujourdhui - 1).length;
  assert.equal(journal.pushs.length, recents);
  if (journal.pushs.length) {
    assert.equal(journal.pushs[0].entetes['Content-Encoding'], 'aes128gcm');
    assert.match(journal.pushs[0].entetes.Authorization, /^vapid t=.+, k=/);
  }
});

test('quotidien : rien à faire, rien d\'écrit', async () => {
  const aujourdhui = jourDe(Date.now(), cfg.temps);
  const etat = creerEtat(cfg, { nom: 'Essai', jour: aujourdhui, graine: 'g' });
  const journal = fausseBase(etat);
  await traiter(requete('quotidien'));
  assert.equal(journal.patchs.length, 0);
  assert.equal(journal.pushs.length, 0);
});

test('sessions : marque puis notifie chaque fin, sauf si la notification est coupée', async () => {
  const etat = creerEtat(cfg, { nom: 'Essai', jour: 20000, graine: 'g' });
  const journal = fausseBase(etat, { sessions: [{ id: 'a', user_id: 'u1', titre: '', duree_min: 95 }] });
  await traiter(requete('sessions'));
  assert.equal(journal.sessionsMarquees.length, 1);
  assert.equal(journal.pushs.length, 1);

  etat.reglages.notifications.session = false;
  const j2 = fausseBase(etat, { sessions: [{ id: 'b', user_id: 'u1', titre: '', duree_min: 30 }] });
  await traiter(requete('sessions'));
  assert.equal(j2.sessionsMarquees.length, 1);
  assert.equal(j2.pushs.length, 0);
});
