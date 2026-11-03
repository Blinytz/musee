// Orchestrateur : relie les moteurs purs, l'état stocké (Supabase ou local)
// et le registre commun d'Éclats.
//
// Règles d'écriture :
// - une DÉPENSE passe au registre avant l'état : on ne livre jamais une œuvre
//   impayée. L'opération est notée dans une file locale avant l'appel, et
//   rejouée avec la même clé si l'application se ferme entre les deux ;
// - un GAIN s'écrit dans l'état d'abord (marqué « à verser »), puis au
//   registre : une session ne peut pas se terminer deux fois, et un versement
//   manqué se rattrape au prochain chargement ;
// - toute écriture d'état porte la version lue : si l'Edge Function a fermé
//   une journée entre-temps, on relit et on rejoue l'action sur l'état frais.

import { CONFIG, configEffective } from './config.js';
import { jourDe } from './moteur/temps.js';
import { migrer, copie } from './moteur/etat.js';
import { avancer, creerMusee } from './moteur/journee.js';
import * as A from './moteur/actions.js';
import { uuid } from './moteur/alea.js';

const CLE_FILE = 'musee_operations_v1';
const RETENTION_JOURNAL = 500;

export function createJeu({ backend, catalogue, storage = globalThis.localStorage }) {
  let etat = null;
  let version = 0;
  let cfg = configEffective({});
  let musees = [];
  const ecouteurs = new Set();

  const maintenant = () => backend.maintenant();
  const jour = () => jourDe(maintenant(), cfg.temps);
  const ctx = () => ({ musees, tirer: (p) => backend.tirer(p) });

  function notifier() {
    for (const f of ecouteurs) {
      try { f(etat); } catch (e) { console.error(e); }
    }
  }

  function recalculerConfig() {
    cfg = configEffective(etat?.reglages?.parametres || {});
  }

  /* ---------- File des opérations payantes ---------- */

  function lireFile() {
    try { return JSON.parse(storage.getItem(CLE_FILE) || '[]'); } catch { return []; }
  }
  function ecrireFile(f) { storage.setItem(CLE_FILE, JSON.stringify(f)); }
  function retirerDeFile(id) { ecrireFile(lireFile().filter((o) => o.id !== id)); }

  /* ---------- Lecture et écriture de l'état ---------- */

  async function relire() {
    const lu = await backend.chargerEtat();
    if (!lu) { etat = null; version = 0; return null; }
    etat = migrer(lu.etat, CONFIG);
    version = lu.version;
    recalculerConfig();
    return etat;
  }

  async function ecrire(nouvel) {
    version = await backend.enregistrerEtat(nouvel, version);
    etat = nouvel;
    recalculerConfig();
    notifier();
  }

  function journaliser(e, mouvement) {
    e.eclats = [...(e.eclats || []), mouvement].slice(-RETENTION_JOURNAL);
  }

  /**
   * Applique une transformation `f(etat) → { etat, ... }` et l'enregistre,
   * en rejouant sur un état relu en cas de conflit de version.
   */
  async function appliquer(f, essais = 3) {
    for (let i = 0; i < essais; i++) {
      const r = f(etat);
      try {
        await ecrire(r.etat);
        return r;
      } catch (e) {
        if (e.code !== 'conflit' || i === essais - 1) throw e;
        await relire();
        await rattraperSansEcrire();
      }
    }
    return null;
  }

  async function rattraperSansEcrire() {
    if (!etat) return false;
    const j = jour();
    if (etat.jourFerme >= j - 1) return false;
    etat = await avancer(cfg, etat, j, ctx());
    return true;
  }

  /** Rejoue les jours manquants et enregistre. */
  async function rattraper() {
    if (!etat) return;
    for (let i = 0; i < 3; i++) {
      const avant = etat;
      if (!(await rattraperSansEcrire())) return;
      try {
        await ecrire(etat);
        return;
      } catch (e) {
        etat = avant;
        if (e.code !== 'conflit') throw e;
        await relire();
      }
    }
  }

  /* ---------- Actions ---------- */

  /**
   * Exécute une action du moteur. `nom` est le nom exporté par actions.js,
   * `params` ses paramètres ; le jour courant et les musées sont ajoutés.
   */
  async function executer(nom, params, { operation } = {}) {
    if (!etat) throw new Error('Musée non chargé');
    const action = A[nom];
    if (!action) throw new Error(`Action inconnue : ${nom}`);
    const j = jour();
    const appeler = (e) => action(cfg, e, params, j, musees);

    // Essai à blanc : refuse tôt, sans rien payer, une action impossible.
    const essai = appeler(etat);

    if (essai.depense) {
      const op = operation || { id: uuid(), nom, params, tentative: uuid().slice(0, 8) };
      const cle = `${essai.depense.cle}:${op.tentative}`;
      if (!operation) ecrireFile([...lireFile(), op]);
      try {
        await backend.depenser({ ...essai.depense, cle, reprise: !!operation });
      } catch (e) {
        retirerDeFile(op.id);
        throw e;
      }
      const r = await appliquer((e) => {
        const res = appeler(e);
        if (res.depense) {
          journaliser(res.etat, {
            cle, montant: -res.depense.montant, type: res.depense.type,
            motif: res.depense.motif, jour: j, verse: true,
          });
        }
        return res;
      });
      retirerDeFile(op.id);
      return r;
    }

    if (essai.gain) {
      let cle = null;
      const r = await appliquer((e) => {
        const res = appeler(e);
        if (res.gain) {
          cle = res.gain.cle;
          journaliser(res.etat, {
            cle, montant: res.gain.montant, type: res.gain.type, motif: res.gain.motif,
            jour: j, verse: false, referenceId: res.gain.referenceId || null, meta: res.gain.meta || null,
          });
        }
        return res;
      });
      await verser();
      return r;
    }

    return appliquer(appeler);
  }

  /** Verse au registre les gains notés « à verser ». */
  async function verser() {
    if (!etat) return;
    const enAttente = (etat.eclats || []).filter((m) => m.montant > 0 && !m.verse);
    for (const m of enAttente) {
      try {
        await backend.recompenser({
          montant: m.montant, cle: m.cle, motif: m.motif, type: m.type,
          referenceId: m.referenceId, meta: m.meta,
        });
      } catch (e) {
        console.warn('Versement reporté', e);
        return;
      }
      await appliquer((e) => {
        const n = copie(e);
        const x = n.eclats.find((y) => y.cle === m.cle);
        if (x) x.verse = true;
        const s = n.sessions.find((y) => `musee:session:${y.id}` === m.cle);
        if (s) s.verse = true;
        return { etat: n };
      });
    }
  }

  /** Rejoue les dépenses interrompues (application fermée entre registre et état). */
  async function reprendreOperations() {
    for (const op of lireFile()) {
      const deja = (etat.eclats || []).some((m) => m.cle.endsWith(`:${op.tentative}`));
      if (deja) { retirerDeFile(op.id); continue; }
      try {
        await executer(op.nom, op.params, { operation: op });
      } catch (e) {
        // L'action n'a plus de sens (arrivage expiré…) : si le débit avait eu
        // lieu, il reste visible dans le journal du registre.
        console.warn('Opération abandonnée', op, e);
        retirerDeFile(op.id);
      }
    }
  }

  /* ---------- Sessions ---------- */

  async function demarrerSession(oeuvre, dureeMin) {
    // Contrôle complet avant de prévenir le serveur.
    A.demarrerSession(cfg, etat, { id: 'essai', oeuvre, dureeMin, debut: 0 }, jour());
    const id = uuid();
    // Le titre part dans la notification de fin : on ne le révèle pas avant
    // la restauration.
    const titre = '';
    const { debut } = await backend.demarrerSession({ id, oeuvre, dureeMin, titre });
    return executer('demarrerSession', { id, oeuvre, dureeMin, debut });
  }

  /**
   * Termine la session : à l'heure prévue, ou maintenant si `anticipe`.
   * Plusieurs appels simultanés (minuterie, retour au premier plan) se
   * rejoignent sur la même fin.
   */
  let finEnCours = null;
  function terminerSession({ anticipe = false } = {}) {
    if (finEnCours) return finEnCours;
    const s = etat?.session;
    if (!s) return Promise.resolve(null);
    finEnCours = (async () => {
      let fin = s.debut + s.dureeMin * 60e3;
      if (anticipe) fin = (await backend.arreterSession(s.id)).fin;
      else if (maintenant() < fin) return null;
      return executer('terminerSession', fin);
    })().finally(() => { finEnCours = null; });
    return finEnCours;
  }

  /* ---------- Cycle de vie ---------- */

  /**
   * Le catalogue mensuel peut changer le niveau d'une œuvre : on reporte le
   * nouveau niveau sur les œuvres possédées, la progression étant gardée en
   * pourcentage. Sans réseau, rien ne change.
   */
  async function synchroniserNiveaux() {
    const ids = Object.keys(etat.oeuvres).map(Number);
    const fiches = await catalogue.fiches?.(ids).catch(() => null);
    if (!fiches) return;
    const niveaux = {};
    fiches.forEach((f, i) => {
      if (f && Number.isInteger(f.niveau) && f.niveau !== etat.oeuvres[ids[i]].niveau) niveaux[ids[i]] = f.niveau;
    });
    if (Object.keys(niveaux).length) await executer('ajusterNiveaux', { niveaux }).catch(() => {});
  }

  async function charger() {
    musees = await catalogue.musees().catch(() => []);
    await relire();
    if (!etat) return null;
    await rattraper();
    await reprendreOperations();
    await verser();
    await synchroniserNiveaux();
    notifier();
    return etat;
  }

  async function creer(nom) {
    const graine = uuid();
    const e = await creerMusee(configEffective({}), { nom: String(nom).trim().slice(0, 60), jour: jour(), graine }, ctx());
    version = 0;
    await ecrire(e);
    return etat;
  }

  return {
    get etat() { return etat; },
    get cfg() { return cfg; },
    get musees() { return musees; },
    backend,
    catalogue,
    jour,
    maintenant,
    charger,
    creer,
    rattraper,
    executer,
    verser,
    demarrerSession,
    terminerSession,
    ecouter(f) { ecouteurs.add(f); return () => ecouteurs.delete(f); },
    configParDefaut: CONFIG,
  };
}
