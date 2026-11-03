// Abonnement Web Push. L'envoi se fait côté serveur (Edge Function `musee`),
// déclenché par pg_cron : fin de session, arrivages, demandes de prêt…

import { CONFIG } from '../config.js';

function base64VersOctets(b64) {
  const p = '='.repeat((4 - (b64.length % 4)) % 4);
  const brut = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(brut, (c) => c.charCodeAt(0));
}

function octetsVersBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function enregistrement() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  return navigator.serviceWorker.getRegistration('./') || null;
}

/** 'indisponible' | 'abonne' | 'desabonne' */
export async function etatPush() {
  const reg = await enregistrement();
  if (!reg || !('Notification' in window) || !CONFIG.push?.clePublique) return 'indisponible';
  const abo = await reg.pushManager.getSubscription();
  return abo && Notification.permission === 'granted' ? 'abonne' : 'desabonne';
}

export async function abonnerPush(app) {
  const reg = await enregistrement();
  if (!reg) throw new Error('Notifications indisponibles');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications refusées');
  const abo = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64VersOctets(CONFIG.push.clePublique),
  });
  await app.jeu.backend.abonner({
    endpoint: abo.endpoint,
    p256dh: octetsVersBase64(abo.getKey('p256dh')),
    auth: octetsVersBase64(abo.getKey('auth')),
  });
}

export async function desabonnerPush(app) {
  const reg = await enregistrement();
  const abo = await reg?.pushManager.getSubscription();
  if (!abo) return;
  await app.jeu.backend.desabonner(abo.endpoint).catch(() => {});
  await abo.unsubscribe();
}
