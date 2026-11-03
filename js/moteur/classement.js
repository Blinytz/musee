// Classement mondial : les musées réels de Wikidata dont la fréquentation
// annuelle est renseignée, plus le joueur. Principal par fréquentation
// annualisée, secondaire par prestige.

import { prestige } from './regles.js';

/** Somme du prestige des œuvres restaurées du joueur, où qu'elles soient. */
export function prestigeJoueur(cfg, etat) {
  return Object.values(etat.oeuvres)
    .filter((o) => o.progression >= 1 && o.lieu !== 'volee')
    .reduce((s, o) => s + prestige(cfg, o.niveau), 0);
}

/** Visiteurs annualisés gagnés par les musées emprunteurs pendant les prêts. */
function bonusPrets(cfg, etat) {
  const b = new Map();
  for (const p of etat.prets?.enCours || []) {
    const v = cfg.prets.visiteursParPrestige * prestige(cfg, p.niveau) * cfg.frequentation.joursAnnee;
    b.set(p.musee, (b.get(p.musee) || 0) + v);
  }
  return b;
}

/**
 * Lignes triées. À égalité, le musée réel passe devant : il faut le dépasser
 * pour prendre sa place.
 */
export function tableau(cfg, etat, musees, annualisee, critere = 'annualisee') {
  const bonus = bonusPrets(cfg, etat);
  const lignes = musees.map((m) => ({
    id: m.id, nom: m.nom, pays: m.pays, ville: m.ville,
    annualisee: m.visiteurs + (bonus.get(m.id) || 0),
    prestige: m.prestige || 0,
  }));
  lignes.push({
    id: 'joueur', nom: etat.nom, joueur: true,
    annualisee, prestige: prestigeJoueur(cfg, etat),
  });
  lignes.sort((a, b) => (b[critere] - a[critere]) || ((a.joueur ? 1 : 0) - (b.joueur ? 1 : 0)) || String(a.id).localeCompare(String(b.id)));
  lignes.forEach((l, i) => { l.rang = i + 1; });
  return lignes;
}

/** Rangs du joueur et ensemble des musées devant lui. */
export function positionJoueur(cfg, etat, musees, annualisee) {
  const principal = tableau(cfg, etat, musees, annualisee, 'annualisee');
  const secondaire = tableau(cfg, etat, musees, annualisee, 'prestige');
  const rang = principal.find((l) => l.joueur).rang;
  return {
    rang,
    rangPrestige: secondaire.find((l) => l.joueur).rang,
    total: principal.length,
    devant: principal.filter((l) => l.rang < rang).map((l) => l.id),
  };
}
