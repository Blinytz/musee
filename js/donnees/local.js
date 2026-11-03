// Mode local : même interface que le registre, sans réseau ni compte. Sert à
// la démonstration (`?demo`) et aux essais. Les Éclats y sont fictifs et ne
// touchent jamais le registre commun.

import { tirerDansListe } from '../moteur/arrivages.js';

const CLE = 'musee_demo_v1';

export function createLocal({ storage = globalThis.localStorage, catalogue, soldeInitial = 5000, horlogeReelle = () => Date.now() } = {}) {
  // L'horloge de démonstration peut être avancée (une heure, un jour) pour
  // voir une session se terminer ou une journée se fermer sans attendre.
  let avance = null;
  const horloge = () => {
    if (avance === null) avance = lire().avance || 0;
    return horlogeReelle() + avance;
  };
  function lire() {
    try { return JSON.parse(storage.getItem(CLE) || 'null') || nouveau(); } catch { return nouveau(); }
  }
  function nouveau() {
    return { solde: soldeInitial, mouvements: {}, etat: null, version: 0, sessions: {}, images: {} };
  }
  function ecrire(d) { storage.setItem(CLE, JSON.stringify(d)); }

  return {
    mode: 'local',
    utilisateur: () => ({ id: 'local', email: 'démo' }),
    estConnecte: () => true,
    connexion: async () => ({ id: 'local' }),
    deconnexion: () => {},
    maintenant: horloge,

    async solde() { return lire().solde; },

    async depenser({ montant, cle }) {
      // Comme le registre : une clé déjà débitée est rejouée, sans contrôle.
      const d = lire();
      if (d.mouvements[cle]) return { amount: d.mouvements[cle], idempotent_replay: true };
      if (d.solde < montant) {
        const e = new Error('Éclats insuffisants');
        e.code = 'solde';
        throw e;
      }
      d.solde -= montant;
      d.mouvements[cle] = -montant;
      ecrire(d);
      return { amount: montant, balance_after: d.solde };
    },

    async recompenser({ montant, cle }) {
      const d = lire();
      if (!d.mouvements[cle]) {
        d.solde += montant;
        d.mouvements[cle] = montant;
        ecrire(d);
      }
      return { amount: montant, balance_after: d.solde };
    },

    async chargerEtat() {
      const d = lire();
      return d.etat ? { etat: d.etat, version: d.version } : null;
    },

    async enregistrerEtat(etat, version) {
      const d = lire();
      if (d.version !== version) {
        const e = new Error('Conflit de version');
        e.code = 'conflit';
        throw e;
      }
      d.etat = etat;
      d.version = version + 1;
      ecrire(d);
      return d.version;
    },

    async demarrerSession({ id, dureeMin }) {
      const d = lire();
      const debut = horloge();
      d.sessions[id] = { debut, fin: debut + dureeMin * 60e3 };
      ecrire(d);
      return d.sessions[id];
    },

    async arreterSession(id) {
      const d = lire();
      const s = d.sessions[id];
      const fin = s ? Math.min(horloge(), s.fin) : horloge();
      return { fin };
    },

    async tirer({ niveau, support, graine, exclus }) {
      const ids = await catalogue.index(support, niveau);
      return tirerDansListe(ids, graine, exclus);
    },

    async abonner() {},
    async desabonner() {},

    async envoyerImage(oeuvre, fichier) {
      const url = await new Promise((ok, ko) => {
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.onerror = ko;
        r.readAsDataURL(fichier);
      });
      const d = lire();
      const chemin = `local/${oeuvre}-${horloge()}`;
      d.images[chemin] = url;
      ecrire(d);
      return chemin;
    },
    async urlSignee(chemin) { return lire().images[chemin] || null; },
    async supprimerImage(chemin) {
      const d = lire();
      delete d.images[chemin];
      ecrire(d);
    },

    /** Remet la démonstration à zéro. */
    reinitialiser() { storage.removeItem(CLE); },

    /** Avance l'horloge de démonstration. */
    avancer(ms) {
      const d = lire();
      d.avance = (d.avance || 0) + ms;
      avance = d.avance;
      ecrire(d);
    },
  };
}
