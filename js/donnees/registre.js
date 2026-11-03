// Client du registre commun d'Éclats et du schéma Musée dans Supabase.
//
// Aucune clé secrète : la clé publishable, comme les autres applications. La
// session vit sous `eclats_session`, partagée par toutes les applications de
// blinytz.github.io : se connecter une fois suffit.
//
// Musée dépense (acquisitions, investissements, campagnes, emprunts) et
// crédite (sessions, prêts). `eclats_spend` débite au plus le solde : une
// dépense partielle est aussitôt remboursée, comme dans Missions, pour qu'une
// œuvre ne s'achète jamais à moitié prix.
//
// Fabrique injectable (fetch, storage) pour rester testable hors navigateur.

import { uuid, FORME_UUID } from '../moteur/alea.js';

export const REGISTRE_CONFIG = {
  url: 'https://psutbulpezfdftmaqkoo.supabase.co',
  anonKey: 'sb_publishable_KTE_3tQq6eGEo4z2f4QrUA_v7F4K4fT',
};

export const APP_ID = 'musee';

export class ErreurRegistre extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'ErreurRegistre';
    this.code = code;
    this.status = status;
  }
}

export function createRegistre({
  url = REGISTRE_CONFIG.url,
  anonKey = REGISTRE_CONFIG.anonKey,
  sessionKey = 'eclats_session',
  fetch: fetchImpl,
  storage,
} = {}) {
  const doFetch = fetchImpl
    || (typeof globalThis !== 'undefined' && globalThis.fetch ? (...a) => globalThis.fetch(...a) : null);
  const store = storage || (typeof globalThis !== 'undefined' && globalThis.localStorage) || memoire();
  if (!doFetch) throw new Error('Aucune implémentation fetch disponible.');

  let session = null;
  try { session = JSON.parse(store.getItem(sessionKey) || 'null'); } catch { session = null; }
  // Décalage entre l'horloge du serveur et celle de l'appareil, relu sur
  // l'en-tête Date de chaque réponse : une session se mesure à l'heure du
  // serveur, jamais à celle du téléphone.
  let decalage = 0;

  function enregistrerSession(s) {
    session = s;
    if (s) store.setItem(sessionKey, JSON.stringify(s));
    else store.removeItem(sessionKey);
  }

  const utilisateur = () => (session ? session.user : null);
  const estConnecte = () => !!session?.access_token;

  async function connexion(email, motDePasse) {
    const r = await doFetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: motDePasse }),
    });
    const data = await r.json();
    if (!r.ok) throw new ErreurRegistre(data.error_description || data.msg || 'Connexion refusée', 'connexion', r.status);
    enregistrerSession(data);
    return data.user;
  }

  function deconnexion() { enregistrerSession(null); }

  async function rafraichir() {
    if (!session?.refresh_token) return false;
    const r = await doFetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!r.ok) { enregistrerSession(null); return false; }
    enregistrerSession(await r.json());
    return true;
  }

  async function appel(chemin, options = {}, dejaRetente = false) {
    const entetes = { apikey: anonKey, 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (session?.access_token) entetes.Authorization = `Bearer ${session.access_token}`;
    const avant = Date.now();
    const r = await doFetch(`${url}${chemin}`, { ...options, headers: entetes });
    const date = r.headers?.get?.('date');
    if (date) {
      const serveur = Date.parse(date);
      // L'en-tête est à la seconde : on vise le milieu de l'aller-retour.
      if (!Number.isNaN(serveur)) decalage = serveur + 500 - (avant + Date.now()) / 2;
    }
    if (r.status === 401 && !dejaRetente && await rafraichir()) return appel(chemin, options, true);
    const texte = await r.text();
    if (!r.ok) {
      let message = `Erreur ${r.status}`;
      try { message = JSON.parse(texte).message || message; } catch { /* corps non JSON */ }
      throw new ErreurRegistre(message, 'http', r.status);
    }
    if (!texte) return null;
    try { return JSON.parse(texte); } catch { return null; }
  }

  const rpc = (fonction, args = {}) => appel(`/rest/v1/rpc/${fonction}`, { method: 'POST', body: JSON.stringify(args) });

  async function solde() {
    return Number(await rpc('eclats_balance')) || 0;
  }

  /**
   * Dépense idempotente. Refuse avant tout débit si le solde ne suffit pas ;
   * si le serveur ne débite qu'une partie (solde changé entre-temps), il
   * rembourse aussitôt et lève une erreur.
   */
  async function depenser({ montant, cle, motif, type, meta, reprise = false }) {
    if (!(montant > 0)) return null;
    // Une reprise rejoue une clé peut-être déjà débitée : le solde a alors
    // déjà baissé, le contrôle préalable refuserait à tort.
    if (!reprise) {
      const disponible = await solde();
      if (disponible < montant) throw new ErreurRegistre('Éclats insuffisants', 'solde');
    }
    const referenceId = uuid();
    const r = await rpc('eclats_spend', {
      p_app_id: APP_ID,
      p_amount: montant,
      p_reason: motif,
      p_reference_type: `musee_${type || 'depense'}`,
      p_reference_id: referenceId,
      p_idempotency_key: cle,
      p_metadata: meta ?? null,
    });
    if (r?.adjusted) {
      await rpc('eclats_refund', {
        p_app_id: APP_ID,
        p_reference_type: `musee_${type || 'depense'}`,
        p_reference_id: r.idempotent_replay ? null : referenceId,
        p_reason: `Annulation : ${motif}`,
        p_idempotency_key: `${cle}:annulation`,
        p_metadata: null,
      }).catch(() => {});
      throw new ErreurRegistre('Éclats insuffisants', 'solde');
    }
    return r;
  }

  /** Crédit idempotent : fin de session, rémunération de prêt. */
  function recompenser({ montant, cle, motif, type, referenceId, meta }) {
    return rpc('eclats_reward', {
      p_app_id: APP_ID,
      p_amount: montant,
      p_reason: motif,
      p_reference_type: `musee_${type || 'gain'}`,
      p_reference_id: referenceId && FORME_UUID.test(referenceId) ? referenceId : null,
      p_idempotency_key: cle,
      p_metadata: meta ?? null,
    });
  }

  /* ---------- Schéma Musée ---------- */

  async function chargerEtat() {
    const lignes = await appel(`/rest/v1/musee_etats?select=etat,version&user_id=eq.${utilisateur()?.id}`);
    return lignes?.[0] ? { etat: lignes[0].etat, version: Number(lignes[0].version) } : null;
  }

  /** Écrit l'état si la version n'a pas bougé ; renvoie la nouvelle version. */
  async function enregistrerEtat(etat, version) {
    try {
      return Number(await rpc('musee_enregistrer', { p_etat: etat, p_version: version }));
    } catch (e) {
      if (/conflit/i.test(e.message)) throw new ErreurRegistre('Conflit de version', 'conflit');
      throw e;
    }
  }

  /** Démarre une session : le serveur note l'heure de début. */
  async function demarrerSession({ id, oeuvre, dureeMin, titre }) {
    const r = await rpc('musee_session_demarrer', { p_id: id, p_oeuvre: oeuvre, p_duree: dureeMin, p_titre: titre });
    return { debut: Date.parse(r.debut), fin: Date.parse(r.fin_prevue) };
  }

  async function arreterSession(id) {
    const r = await rpc('musee_session_arreter', { p_id: id });
    return { fin: Date.parse(r.fin) };
  }

  /** Tirage d'une œuvre du catalogue (règle partagée avec le mode local). */
  function tirer({ niveau, support, graine, exclus }) {
    return rpc('musee_tirer', {
      p_niveau: niveau,
      p_support: support,
      p_graine: graine,
      p_exclus: [...exclus],
    }).then((id) => (id === null || id === undefined ? null : Number(id)));
  }

  function abonner({ endpoint, p256dh, auth }) {
    return rpc('musee_abonner', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth });
  }

  function desabonner(endpoint) {
    return rpc('musee_desabonner', { p_endpoint: endpoint });
  }

  /* ---------- Images personnalisées (bucket privé) ---------- */

  async function envoyerImage(oeuvre, fichier) {
    const ext = (fichier.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const chemin = `${utilisateur().id}/${oeuvre}-${Date.now()}.${ext}`;
    const entetes = {
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': fichier.type || 'image/jpeg',
      'x-upsert': 'true',
    };
    const r = await doFetch(`${url}/storage/v1/object/musee-images/${chemin}`, { method: 'POST', headers: entetes, body: fichier });
    if (!r.ok) throw new ErreurRegistre('Envoi de l\'image refusé', 'image', r.status);
    return chemin;
  }

  async function urlSignee(chemin, secondes = 3600) {
    const r = await appel(`/storage/v1/object/sign/musee-images/${chemin}`, {
      method: 'POST', body: JSON.stringify({ expiresIn: secondes }),
    });
    return `${url}/storage/v1${r.signedURL}`;
  }

  async function supprimerImage(chemin) {
    await appel(`/storage/v1/object/musee-images/${chemin}`, { method: 'DELETE' }).catch(() => {});
  }

  return {
    mode: 'serveur',
    utilisateur,
    estConnecte,
    connexion,
    deconnexion,
    maintenant: () => Date.now() + decalage,
    solde,
    depenser,
    recompenser,
    chargerEtat,
    enregistrerEtat,
    demarrerSession,
    arreterSession,
    tirer,
    abonner,
    desabonner,
    envoyerImage,
    urlSignee,
    supprimerImage,
  };
}

function memoire() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
