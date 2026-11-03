// Le jour de jeu : un entier, nombre de jours depuis le 1er janvier 1970,
// compté en heure de Paris et décalé de 4 h. Une session lancée à 1 h du
// matin appartient encore à la veille.
//
// Tout est calculé avec Intl, disponible dans le navigateur, Node et Deno :
// aucune table de changement d'heure à maintenir.

const formats = new Map();

function format(fuseau) {
  if (!formats.has(fuseau)) {
    formats.set(fuseau, new Intl.DateTimeFormat('en-CA', {
      timeZone: fuseau,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }));
  }
  return formats.get(fuseau);
}

/** Composantes de l'heure murale dans le fuseau donné. */
export function heureMurale(ms, fuseau) {
  const p = {};
  for (const { type, value } of format(fuseau).formatToParts(new Date(ms))) p[type] = value;
  return {
    annee: Number(p.year), mois: Number(p.month), jour: Number(p.day),
    heure: Number(p.hour), minute: Number(p.minute), seconde: Number(p.second),
  };
}

/** Décalage du fuseau par rapport à UTC, en millisecondes, à cet instant. */
function decalage(ms, fuseau) {
  const h = heureMurale(ms, fuseau);
  const commeUtc = Date.UTC(h.annee, h.mois - 1, h.jour, h.heure, h.minute, h.seconde);
  return commeUtc - Math.floor(ms / 1000) * 1000;
}

/** Jour de jeu de l'instant `ms`. */
export function jourDe(ms, temps) {
  const h = heureMurale(ms - temps.heureDebutJour * 3600e3, temps.fuseau);
  return Math.round(Date.UTC(h.annee, h.mois - 1, h.jour) / 864e5);
}

/** Instant (ms) où commence le jour de jeu `jour` : 4 h, heure de Paris. */
export function debutDuJour(jour, temps) {
  const murale = jour * 864e5 + temps.heureDebutJour * 3600e3;
  // Deux passes : le décalage dépend de l'instant qu'on cherche.
  let ms = murale - decalage(murale, temps.fuseau);
  ms = murale - decalage(ms, temps.fuseau);
  return ms;
}

/** 0 dimanche, 1 lundi… 6 samedi. Le 1er janvier 1970 était un jeudi. */
export function jourSemaine(jour) {
  return ((jour % 7) + 7 + 4) % 7;
}

/** Date affichable du jour de jeu, AAAA-MM-JJ. */
export function dateIso(jour) {
  return new Date(jour * 864e5).toISOString().slice(0, 10);
}

/** Premier lundi (ou jour de semaine `js`) strictement après `jour`. */
export function prochainJourSemaine(jour, js) {
  const ecart = ((js - jourSemaine(jour)) + 7) % 7 || 7;
  return jour + ecart;
}
