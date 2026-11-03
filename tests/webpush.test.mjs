import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chiffrer, vapid, octets, b64 } from '../supabase/source/webpush.js';

// RFC 8291, annexe A : clés, sel et résultat attendus.
const RFC = {
  message: 'When I grow up, I want to be a watermelon',
  asPrivee: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublique: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPublique: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  sel: 'DGv6ra1nlYgDCS1FRnbzlw',
  attendu: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

test('chiffrement aes128gcm conforme au vecteur de la RFC 8291', async () => {
  const corps = await chiffrer(RFC.message, { p256dh: RFC.uaPublique, auth: RFC.auth }, { asPrivee: RFC.asPrivee, asPublique: RFC.asPublique, sel: RFC.sel });
  assert.equal(b64(corps), RFC.attendu);
});

test('jeton VAPID : signature ES256 vérifiable avec la clé publique', async () => {
  const paire = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', paire.privateKey);
  const publique = b64(new Uint8Array(await crypto.subtle.exportKey('raw', paire.publicKey)));
  const entete = await vapid('https://fcm.googleapis.com/fcm/send/abc', { publique, privee: jwk.d, sujet: 'https://blinytz.github.io/musee/' }, 0);
  const [, jeton, k] = entete.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, publique);
  const [h, c, s] = jeton.split('.');
  const corps = JSON.parse(new TextDecoder().decode(octets(c)));
  assert.equal(corps.aud, 'https://fcm.googleapis.com');
  assert.equal(corps.exp, 12 * 3600);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, paire.publicKey, octets(s), new TextEncoder().encode(`${h}.${c}`));
  assert.ok(ok);
});
