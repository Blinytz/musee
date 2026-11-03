// Arrivages : chaque lundi à 4 h, cinq œuvres (plus avec un conservateur),
// valables sept jours.
//
// Le tirage d'une œuvre précise dans le catalogue est délégué à `tirer`, qui
// existe en deux versions (SQL dans Supabase, index statiques en local). Les
// deux appliquent la même règle, `rangTirage` : parmi les candidats, celui dont
// l'empreinte est la plus petite. Le serveur et l'application tirent ainsi
// exactement la même œuvre pour la même graine.

import { generateur, choixPondere, empreinte } from './alea.js';
import { effetsPersonnel } from './personnel.js';

/** Empreinte d'un candidat pour une graine : identique en SQL (voir schema.sql). */
export function rangTirage(id, graine) {
  return Math.imul((id ^ graine) >>> 0, 2654435761 | 0) >>> 0;
}

/** Choisit dans une liste d'ids, en excluant `exclus` (Set). */
export function tirerDansListe(ids, graine, exclus) {
  let meilleur = null;
  let rang = Infinity;
  for (const id of ids) {
    if (exclus.has(id)) continue;
    const r = rangTirage(id, graine);
    if (r < rang || (r === rang && id < meilleur)) { rang = r; meilleur = id; }
  }
  return meilleur;
}

/** Un statut débloque-t-il une capacité (`prets`, `expositions`…) ? */
export function debloque(cfg, etat, drapeau) {
  return cfg.statuts.slice(0, etat.statut + 1).some((s) => s[drapeau]);
}

export function supportsProposes(cfg, etat) {
  const a = cfg.arrivages;
  const tous = Object.entries(a.supports);
  if (debloque(cfg, etat, 'arrivagesGraphiques')) return tous;
  return tous.filter(([s]) => a.supportsDeBase.includes(s));
}

/** Pondération des niveaux : le plus haut accessible pèse 1, le précédent 2… */
export function poidsNiveaux(cfg, etat) {
  const max = cfg.statuts[etat.statut].niveauMax;
  const liste = [];
  for (let n = 0; n <= max; n++) liste.push([n, max - n + 1]);
  return liste;
}

/** Ids déjà possédés ou déjà proposés dans un arrivage encore valable. */
function idsExclus(etat) {
  const exclus = new Set(Object.keys(etat.oeuvres).map(Number));
  for (const a of etat.arrivages) for (const o of a.oeuvres) exclus.add(o.id);
  return exclus;
}

/**
 * Tire un arrivage. `tirer({ niveau, support, graine, exclus })` renvoie un
 * id ou null. Asynchrone : la version serveur interroge la base.
 */
export async function tirerArrivage(cfg, etat, jour, tirer, { premier = false } = {}) {
  const alea = generateur(`${etat.graine}:arrivage:${jour}`);
  const exclus = idsExclus(etat);
  const supports = supportsProposes(cfg, etat);
  const max = cfg.statuts[etat.statut].niveauMax;
  // Le conservateur ajoute une ou deux œuvres, dont une du plus haut niveau.
  const conservateur = effetsPersonnel(cfg, etat).conservateur;
  const nombre = premier ? cfg.depart.premierArrivage.nombre : cfg.arrivages.nombre + conservateur;

  const oeuvres = [];
  for (let i = 0; i < nombre; i++) {
    let niveau;
    if (premier) niveau = cfg.depart.premierArrivage.niveau;
    else if (conservateur > 0 && i === 0) niveau = max;
    else niveau = choixPondere(poidsNiveaux(cfg, etat), alea);
    const support = choixPondere(supports, alea);

    // Si la combinaison est épuisée, on essaie les autres supports, puis les
    // niveaux inférieurs : un arrivage ne doit pas rester à moitié vide.
    const essais = [[niveau, support], ...supports.filter(([s]) => s !== support).map(([s]) => [niveau, s])];
    for (let n = niveau - 1; n >= 0; n--) for (const [s] of supports) essais.push([n, s]);
    for (const [n, s] of essais) {
      const graine = empreinte(`${etat.graine}:${jour}:${i}:${n}:${s}`);
      const id = await tirer({ niveau: n, support: s, graine, exclus });
      if (id !== null && id !== undefined) {
        exclus.add(id);
        oeuvres.push({ id, niveau: n, support: s, offerte: premier && i < cfg.depart.premierArrivage.offertes });
        break;
      }
    }
  }
  return {
    id: `a${jour}`,
    jour,
    expire: jour + cfg.arrivages.validiteJours,
    oeuvres,
    premier,
  };
}
