// Formules élémentaires du jeu. Fonctions pures : elles reçoivent toujours la
// configuration effective `cfg` et ne lisent rien d'autre.

export function niveau(cfg, n) {
  return cfg.niveaux[n] ?? cfg.niveaux[0];
}

export function prestige(cfg, n) {
  return niveau(cfg, n).prestige;
}

export function statut(cfg, s) {
  return cfg.statuts[s] ?? cfg.statuts[0];
}

/* ---------- Maîtrise ---------- */

/** Niveau de maîtrise (1 à 10) pour un nombre de minutes de session. */
export function niveauMaitrise(cfg, minutes) {
  const heures = minutes / 60;
  let n = 1;
  cfg.maitrise.heures.forEach((seuil, i) => { if (heures >= seuil) n = i + 1; });
  return n;
}

export function bonusMaitrise(cfg, minutes) {
  return cfg.maitrise.bonus[niveauMaitrise(cfg, minutes) - 1] ?? 0;
}

/** Progression vers le niveau suivant : { niveau, heures, prochain, part }. */
export function progressionMaitrise(cfg, minutes) {
  const n = niveauMaitrise(cfg, minutes);
  const heures = minutes / 60;
  const bas = cfg.maitrise.heures[n - 1];
  const haut = cfg.maitrise.heures[n];
  if (haut === undefined) return { niveau: n, heures, prochain: null, part: 1 };
  return { niveau: n, heures, prochain: haut, part: (heures - bas) / (haut - bas) };
}

/* ---------- Investissements ---------- */

/** Effets cumulés des investissements possédés. */
export function effets(cfg, etat) {
  const e = { revenus: 1, satisfaction: 0, efficacite: 0, revele: 0, remise: 0, securite: 0, salleForte: false };
  for (const id of etat.investissements || []) {
    const inv = cfg.investissements.find((i) => i.id === id);
    if (!inv) continue;
    const f = inv.effets || {};
    if (f.revenus) e.revenus *= f.revenus;
    if (f.satisfaction) e.satisfaction += f.satisfaction;
    if (f.efficacite) e.efficacite += f.efficacite;
    // La remise et la révélation des archives remplacent celles de la
    // bibliothèque (« -20 % au total ») : on garde la plus forte.
    if (f.revele) e.revele = Math.max(e.revele, f.revele);
    if (f.remise) e.remise = Math.max(e.remise, f.remise);
    if (f.securite) e.securite = Math.max(e.securite, f.securite);
    if (f.salleForte) e.salleForte = true;
  }
  return e;
}

/* ---------- Sessions ---------- */

/** Travail effectif, en minutes de travail, d'une session de `minutes` réelles. */
export function travailEffectif(cfg, minutes, bonus) {
  const s = cfg.session;
  return minutes * (1 + s.bonusDureeCoef * minutes / s.bonusDureeRefMin) * (1 + bonus);
}

/** Minutes de travail nécessaires pour restaurer entièrement une œuvre. */
export function travailRequis(cfg, n) {
  return niveau(cfg, n).travailH * 60;
}

/** Recettes d'une session : visiteurs × billet × part × revenus × heures. */
export function recettesSession(tauxHoraire, minutes) {
  return Math.max(0, tauxHoraire * minutes / 60);
}

/** Impôt horaire sur un bénéfice horaire, barème progressif par tranches. */
export function impotHoraire(cfg, beneficeHoraire) {
  let impot = 0;
  let bas = 0;
  for (const t of cfg.impots.tranches) {
    const haut = t.jusqua ?? Infinity;
    if (beneficeHoraire > bas) impot += (Math.min(beneficeHoraire, haut) - bas) * t.taux;
    bas = haut;
  }
  return impot;
}

// Charges de fin de session autres que les salaires, dans l'ordre affiché.
export const CHARGES = ['accueil', 'entretien', 'assurance', 'fournitures'];

/**
 * Fin de session (docs/ECONOMIE.md, section 1) : recettes (le billet en
 * entier) et indemnités d'assurance, puis les charges en clair (salaires,
 * accueil, entretien, assurance, fournitures) et les arriérés, puis l'impôt
 * sur le bénéfice, puis le net. Les taux sont horaires et peuvent être
 * fractionnaires (0,5 ✦/h) ; chaque montant est un nombre entier d'Éclats,
 * arrondi au plus proche, et le net est leur différence exacte. Ce que les
 * recettes ne couvrent pas devient des arriérés, jamais une dette.
 */
export function bilanFinancier(cfg, {
  tauxHoraire, salaireHoraire, charges = {}, minutes, arrieres = 0, abattement = 0, indemnites = 0, primes = 0,
}) {
  const heures = minutes / 60;
  const recettes = Math.round(recettesSession(tauxHoraire, minutes));
  const salaires = Math.round(Math.max(0, salaireHoraire) * heures);
  const lignes = Object.fromEntries(CHARGES.map((k) => [k, Math.round(Math.max(0, charges[k] || 0) * heures)]));
  // Les primes des détectives se règlent avec la session, en une fois.
  const primesDues = minutes ? Math.round(primes) : 0;
  const courant = salaires + CHARGES.reduce((t, k) => t + lignes[k], 0) + primesDues;
  // Un état ancien peut garder des arriérés fractionnaires.
  const anciens = Math.round(arrieres);
  const credits = recettes + (minutes ? Math.round(indemnites) : 0);
  const du = courant + anciens;
  const base = { recettes, indemnites: credits - recettes, salaires, ...lignes, primes: primesDues };
  if (credits < du) {
    return { ...base, arrieresPayes: Math.max(0, credits - courant), arrieresRestants: du - credits, benefice: 0, impot: 0, net: 0 };
  }
  const benefice = credits - du;
  const impot = heures > 0 ? Math.min(benefice, Math.round(heures * impotHoraire(cfg, benefice / heures) * (1 - abattement))) : 0;
  return { ...base, arrieresPayes: anciens, arrieresRestants: 0, benefice, impot, net: benefice - impot };
}

/* ---------- Visiteurs ---------- */

/** Multiplicateur de nouveauté après `jours` jours d'exposition. */
export function nouveaute(cfg, jours) {
  const n = cfg.visiteurs.nouveaute;
  if (jours < n.jusquaUn) return n.depart - (n.depart - 1) * jours / n.jusquaUn;
  if (jours <= n.plateauJusqua) return 1;
  const pas = Math.floor((jours - n.plateauJusqua) / n.baisseTousLes);
  return Math.max(n.plancher, 1 - n.baissePas * pas);
}

/** Jours d'exposition qui correspondent à une nouveauté donnée (≥ 1). */
export function joursPourNouveaute(cfg, valeur) {
  const n = cfg.visiteurs.nouveaute;
  return Math.max(0, Math.round((n.depart - valeur) * n.jusquaUn / (n.depart - 1)));
}

export function prixOptimal(cfg, reputation) {
  return cfg.visiteurs.prix.optimalBase + reputation / cfg.visiteurs.prix.optimalDiviseur;
}

export function facteurPrix(cfg, prix, reputation) {
  return Math.exp(-(prix - 1) / prixOptimal(cfg, reputation));
}

export function facteurReputation(cfg, reputation) {
  return cfg.visiteurs.reputationBase + reputation / cfg.visiteurs.reputationDiviseur;
}

/* ---------- Arrivages ---------- */

/** Prix d'arrivage d'un niveau, remises de documentation comprises. */
/** Prix d'une œuvre d'arrivage : la cote du musée le relève, la documentation le remise. */
export function prixArrivage(cfg, etat, n) {
  const remise = effets(cfg, etat).remise;
  const cote = cfg.cote?.[etat.statut] ?? 1;
  return Math.round(niveau(cfg, n).prix * cote * (1 - remise));
}

/* ---------- Thèmes ---------- */

/** Siècle d'une année : 1503 → 16, -450 → -5. */
export function siecle(an) {
  if (an === undefined || an === null || Number.isNaN(an)) return null;
  if (an > 0) return Math.ceil(an / 100);
  return -(Math.floor(-an / 100) + 1);
}

/** Valeur d'une œuvre pour un type de thème. */
export function valeurTheme(oeuvre, type) {
  switch (type) {
    case 'artiste': return oeuvre.artiste?.q ?? null;
    case 'mouvement': return oeuvre.mouvement?.q ?? null;
    case 'pays': return oeuvre.pays?.q ?? null;
    case 'siecle': return siecle(oeuvre.an);
    case 'support': return oeuvre.support ?? null;
    default: return null;
  }
}

export function estConforme(oeuvre, theme) {
  if (!theme) return true;
  const v = valeurTheme(oeuvre, theme.type);
  return v !== null && v === theme.valeur;
}

/* ---------- Statut ---------- */

/** Fréquentation annualisée : moyenne des derniers jours × 365. */
export function frequentationAnnualisee(cfg, historique) {
  const n = cfg.frequentation.joursMoyenne;
  const derniers = historique.slice(-n);
  if (!derniers.length) return 0;
  const moyenne = derniers.reduce((s, h) => s + h.visiteurs, 0) / derniers.length;
  return Math.round(moyenne * cfg.frequentation.joursAnnee);
}

/** Plus haut statut dont le seuil est atteint. */
export function statutAtteint(cfg, annualisee) {
  let s = 0;
  cfg.statuts.forEach((st, i) => { if (annualisee >= st.seuil) s = i; });
  return s;
}

export function borner(x, min, max) {
  return Math.min(max, Math.max(min, x));
}
