// Web Push sans dépendance : chiffrement aes128gcm (RFC 8291) et signature
// VAPID (RFC 8292), en WebCrypto pur. Tourne à l'identique dans Deno (Edge
// Function) et dans Node (tests), ce qui permet de vérifier le chiffrement
// sur le vecteur de l'annexe A de la RFC 8291.

const enc = new TextEncoder();

export function b64(octets) {
  let s = '';
  for (const o of new Uint8Array(octets)) s += String.fromCharCode(o);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function octets(b64url) {
  const p = '='.repeat((4 - (b64url.length % 4)) % 4);
  const brut = atob((b64url + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(brut, (c) => c.charCodeAt(0));
}

function concat(...parties) {
  const n = parties.reduce((s, p) => s + p.length, 0);
  const r = new Uint8Array(n);
  let i = 0;
  for (const p of parties) { r.set(p, i); i += p.length; }
  return r;
}

async function hmac(cle, donnees) {
  const k = await crypto.subtle.importKey('raw', cle, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, donnees));
}

/** HKDF en deux temps, comme l'écrit la RFC : extraction puis expansion. */
async function hkdf(sel, ikm, info, longueur) {
  const prk = await hmac(sel, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, longueur);
}

/** Clé privée P-256 depuis sa partie publique non compressée (65 octets) et d. */
function jwkPrivee(publique, d, usage) {
  return {
    kty: 'EC', crv: 'P-256', d: typeof d === 'string' ? d : b64(d),
    x: b64(publique.slice(1, 33)), y: b64(publique.slice(33, 65)), ext: true, key_ops: usage,
  };
}

/**
 * Chiffre `message` pour un abonnement { p256dh, auth } (base64url).
 * `essai` fixe la clé éphémère et le sel (vecteur de test uniquement).
 */
export async function chiffrer(message, { p256dh, auth }, essai = null) {
  const uaPublique = octets(p256dh);
  const secretAuth = octets(auth);
  let asPublique;
  let asPrivee;
  if (essai) {
    asPublique = octets(essai.asPublique);
    asPrivee = await crypto.subtle.importKey('jwk', jwkPrivee(asPublique, essai.asPrivee, ['deriveBits']), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  } else {
    const paire = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    asPrivee = paire.privateKey;
    asPublique = new Uint8Array(await crypto.subtle.exportKey('raw', paire.publicKey));
  }
  const sel = essai ? octets(essai.sel) : crypto.getRandomValues(new Uint8Array(16));
  const ua = await crypto.subtle.importKey('raw', uaPublique, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secretEcdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: ua }, asPrivee, 256));

  const infoCle = concat(enc.encode('WebPush: info\0'), uaPublique, asPublique);
  const ikm = await hkdf(secretAuth, secretEcdh, infoCle, 32);
  const cek = await hkdf(sel, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sel, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  // Un seul enregistrement : le texte suivi du délimiteur final 0x02.
  const clair = concat(typeof message === 'string' ? enc.encode(message) : message, new Uint8Array([2]));
  const cle = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cle, clair));

  const rs = new Uint8Array([0, 0, 0x10, 0]);
  return concat(sel, rs, new Uint8Array([asPublique.length]), asPublique, chiffre);
}

/** En-tête Authorization VAPID pour l'origine du point de terminaison. */
export async function vapid(endpoint, { publique, privee, sujet }, maintenant = Date.now()) {
  const aud = new URL(endpoint).origin;
  const entete = b64(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const corps = b64(enc.encode(JSON.stringify({ aud, exp: Math.floor(maintenant / 1000) + 12 * 3600, sub: sujet })));
  const pub = octets(publique);
  const cle = await crypto.subtle.importKey('jwk', jwkPrivee(pub, privee, ['sign']), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cle, enc.encode(`${entete}.${corps}`));
  return `vapid t=${entete}.${corps}.${b64(signature)}, k=${publique}`;
}

/**
 * Envoie une notification. Renvoie le statut HTTP : 201 envoyé, 404 ou 410
 * abonnement mort (à supprimer).
 */
export async function envoyer(abonnement, charge, cles, { ttl = 86400, fetch: f = fetch } = {}) {
  const corps = await chiffrer(JSON.stringify(charge), abonnement);
  const r = await f(abonnement.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapid(abonnement.endpoint, cles),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: 'normal',
    },
    body: corps,
  });
  return r.status;
}
