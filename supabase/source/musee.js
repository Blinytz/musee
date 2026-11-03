// Edge Function « musee » : appelée par pg_cron (voir schema.sql).
//
//   { type: 'quotidien' }  chaque heure : ferme les journées échues de chaque
//                          musée (visiteurs, statut, classement, arrivage du
//                          lundi, prêts…) puis envoie les notifications.
//   { type: 'sessions' }   dès qu'une session arrive à son terme.
//
// Les règles sont celles de l'application : ce fichier importe les mêmes
// moteurs (js/moteur), assemblés en un seul fichier par outils/fonction.mjs.

import { CONFIG, configEffective } from '../../js/config.js';
import { avancer } from '../../js/moteur/journee.js';
import { jourDe } from '../../js/moteur/temps.js';
import { migrer, copie } from '../../js/moteur/etat.js';
import { envoyer } from './webpush.js';

const env = (k) => globalThis.Deno?.env.get(k) ?? globalThis.process?.env?.[k];

const URL_SB = env('SUPABASE_URL');
const CLE_SERVICE = env('SUPABASE_SERVICE_ROLE_KEY');
// Les secrets d'Edge Function sont communs au projet : Musée reprend ceux que
// WikiDeck a posés (CRON_SECRET, VAPID_*). Un secret MUSEE_* les remplace si
// les deux applications doivent un jour se séparer.
const CLE_CRON = env('MUSEE_CLE_CRON') || env('CRON_SECRET');
const URL_CATALOGUE = env('MUSEE_URL_CATALOGUE') || 'https://blinytz.github.io/musee/catalogue/';
const VAPID = {
  publique: env('MUSEE_VAPID_PUBLIQUE') || env('VAPID_PUBLIC'),
  privee: env('MUSEE_VAPID_PRIVEE') || env('VAPID_PRIVATE'),
  sujet: 'https://blinytz.github.io/musee/',
};

async function rest(chemin, { methode = 'GET', corps, preferer } = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/${chemin}`, {
    method: methode,
    headers: {
      apikey: CLE_SERVICE,
      Authorization: `Bearer ${CLE_SERVICE}`,
      'Content-Type': 'application/json',
      ...(preferer ? { Prefer: preferer } : {}),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${chemin} : ${r.status} ${texte.slice(0, 200)}`);
  return texte ? JSON.parse(texte) : null;
}

/** Tirage d'arrivage : même règle que l'application (fonction SQL musee_tirer). */
function tirer({ niveau, support, graine, exclus }) {
  return rest('rpc/musee_tirer', {
    methode: 'POST',
    corps: { p_niveau: niveau, p_support: support, p_graine: graine, p_exclus: [...exclus] },
  });
}

/* ---------- Notifications ---------- */

const MESSAGES = {
  arrivage: (e) => ({ titre: 'Nouvel arrivage', texte: `${e.nombre} œuvres à découvrir`, route: 'arrivages' }),
  expiration: () => ({ titre: 'Arrivage', texte: 'Expire dans 24 h', route: 'arrivages' }),
  pret: (e) => ({ titre: 'Demande de prêt', texte: e.musee || '', route: 'expositions' }),
  classement: (e) => ({
    titre: `${e.rang}e au classement`,
    texte: e.rang < e.avant ? `Devant ${(e.gagnes || []).join(', ')}` : `Derrière ${(e.perdus || []).join(', ')}`,
    route: 'classement',
  }),
  statut: (e, cfg) => ({ titre: 'Nouveau statut', texte: cfg.statuts[e.statut]?.nom || '', route: 'musee' }),
  exposition: (e) => ({ titre: 'Exposition terminée', texte: `${Number(e.visiteurs || 0).toLocaleString('fr-FR')} visiteurs`, route: 'expositions' }),
  cambriolage: (e) => ({ titre: 'Cambriolage', texte: e.titre || '', route: 'securite' }),
  volSalle: (e) => ({ titre: 'Vol en salle', texte: e.titre || '', route: 'securite' }),
  vandalisme: (e) => ({ titre: 'Vandalisme', texte: `${e.titre || ''} abîmée de ${e.degats} points`, route: 'securite' }),
  retrouvee: (e) => ({ titre: 'Œuvre retrouvée', texte: e.titre || '', route: 'securite' }),
  perdue: (e) => ({ titre: 'Œuvre perdue', texte: e.titre || '', route: 'securite' }),
  promotion: (e) => ({ titre: 'Personnel', texte: `${e.nom} passe niveau ${e.niveau}`, route: 'personnel' }),
};

// Réglage de notification qui couvre chaque type d'événement.
const REGLAGE = { volSalle: 'cambriolage', vandalisme: 'cambriolage', retrouvee: 'cambriolage', perdue: 'cambriolage', promotion: 'personnel' };

async function notifier(userId, messages) {
  if (!messages.length || !VAPID.publique || !VAPID.privee) return 0;
  const abonnements = await rest(`musee_abonnements?select=endpoint,p256dh,auth&user_id=eq.${userId}`);
  let envoyes = 0;
  for (const a of abonnements) {
    for (const m of messages) {
      try {
        const statut = await envoyer(a, m, VAPID);
        if (statut === 404 || statut === 410) {
          await rest(`musee_abonnements?endpoint=eq.${encodeURIComponent(a.endpoint)}`, { methode: 'DELETE' });
          break;
        }
        if (statut < 300) envoyes++;
      } catch (e) {
        console.warn('Envoi impossible', e.message);
      }
    }
  }
  return envoyes;
}

/* ---------- Journées ---------- */

async function quotidien() {
  const lignes = await rest('musee_etats?select=user_id,etat,version');
  const musees = await fetch(`${URL_CATALOGUE}musees.json`).then((r) => r.json()).catch(() => []);
  const bilan = [];
  for (const ligne of lignes) {
    try {
      const etat = migrer(ligne.etat, CONFIG);
      const cfg = configEffective(etat.reglages?.parametres);
      const jour = jourDe(Date.now(), cfg.temps);
      let nouvel = etat.jourFerme < jour - 1 ? await avancer(cfg, etat, jour, { musees, tirer }) : copie(etat);

      // Les événements récents non notifiés partent ; les plus anciens sont
      // seulement marqués, pour ne jamais réveiller le téléphone avec du passé.
      const recents = nouvel.evenements.filter((e) => !e.notifie && e.jour >= jour - 1);
      const aMarquer = nouvel.evenements.some((e) => !e.notifie);
      if (nouvel.jourFerme === etat.jourFerme && !aMarquer) { bilan.push({ ok: 'rien' }); continue; }
      nouvel.evenements.forEach((e) => { e.notifie = true; });

      // Écriture conditionnée à la version lue : si l'application a écrit
      // entre-temps, on laisse la main, la prochaine heure rattrapera.
      const ecrit = await rest(`musee_etats?user_id=eq.${ligne.user_id}&version=eq.${ligne.version}&select=version`, {
        methode: 'PATCH',
        corps: { etat: nouvel, version: ligne.version + 1, jour_ferme: nouvel.jourFerme, maj: new Date().toISOString() },
        preferer: 'return=representation',
      });
      if (!ecrit?.length) { bilan.push({ conflit: true }); continue; }

      const voulues = nouvel.reglages?.notifications || {};
      const messages = recents
        .filter((e) => voulues[REGLAGE[e.type] || e.type] !== false && MESSAGES[e.type])
        .map((e) => ({ ...MESSAGES[e.type](e, cfg), tag: `musee-${e.type}` }));
      const envoyes = await notifier(ligne.user_id, messages);
      bilan.push({ jours: nouvel.jourFerme - etat.jourFerme, notifications: envoyes });
    } catch (e) {
      console.error('Musée en erreur', ligne.user_id, e);
      bilan.push({ erreur: e.message });
    }
  }
  return bilan;
}

/* ---------- Fins de session ---------- */

async function sessions() {
  const maintenant = new Date().toISOString();
  const dues = await rest(`musee_sessions?select=id,user_id,titre,duree_min&notifiee=is.false&arretee_a=is.null&fin_prevue=lte.${maintenant}`);
  if (!dues.length) return [];
  // Marquées d'abord : une notification de fin ne part jamais deux fois.
  await rest(`musee_sessions?id=in.(${dues.map((s) => s.id).join(',')})`, { methode: 'PATCH', corps: { notifiee: true } });
  const reglages = new Map();
  for (const s of dues) {
    if (!reglages.has(s.user_id)) {
      const l = await rest(`musee_etats?select=etat->reglages&user_id=eq.${s.user_id}`);
      reglages.set(s.user_id, l?.[0]?.reglages || {});
    }
    if (reglages.get(s.user_id).notifications?.session === false) continue;
    const heures = Math.floor(s.duree_min / 60);
    const minutes = s.duree_min % 60;
    const duree = heures ? `${heures} h${minutes ? ` ${String(minutes).padStart(2, '0')}` : ''}` : `${minutes} min`;
    await notifier(s.user_id, [{ titre: 'Session terminée', texte: s.titre ? `${s.titre} · ${duree}` : duree, route: 'atelier', tag: 'musee-session' }]);
  }
  return dues.map((s) => s.id);
}

export async function traiter(requete) {
  if (!CLE_CRON || requete.headers.get('x-musee-cle') !== CLE_CRON) {
    return new Response('Refusé', { status: 401 });
  }
  const { type } = await requete.json().catch(() => ({}));
  try {
    const r = type === 'sessions' ? await sessions() : await quotidien();
    return Response.json({ type, r });
  } catch (e) {
    console.error(e);
    return Response.json({ erreur: e.message }, { status: 500 });
  }
}

globalThis.Deno?.serve(traiter);
