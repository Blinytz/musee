// Enquêtes (docs/ECONOMIE.md, section 3) : un dossier par œuvre volée. La
// police cherche seule, avec une petite chance chaque semaine ; on peut
// engager des détectives, plusieurs par dossier, pour une mission de 2, 4 ou
// 8 semaines payée d'avance. Chacun a sa chance chaque semaine ; seul celui
// qui ramène l'œuvre touche la prime (5 % du prix de l'œuvre), réglée à la
// fin de la session suivante. Les détectives montent de niveau en retrouvant
// des œuvres. Des pistes arrivent parfois : racheter discrètement, ou
// prévenir la police.

import { generateur, entier, choixPondere } from './alea.js';
import { niveau as niveauOeuvre } from './regles.js';
import { profil, effetsPersonnel } from './personnel.js';
import { evenement } from './etat.js';
import { PRENOMS, NOMS } from './noms.js';

/** Carnet et candidats de la semaine, créés au besoin. */
export function detectivesDe(etat) {
  if (!etat.detectives) etat.detectives = { carnet: [], candidats: [] };
  return etat.detectives;
}

/** Niveau d'un détective : ses œuvres retrouvées. */
export function niveauDetective(cfg, d) {
  let n = 1;
  cfg.detectives.xp.forEach((x, i) => { if ((d.xp || 0) >= x) n = i + 2; });
  return Math.min(cfg.detectives.xp.length + 1, n);
}

/** Chance par semaine qu'un détective retrouve l'œuvre de son dossier. */
export function chanceDetective(cfg, d) {
  const c = cfg.detectives;
  return Math.min(0.9, (c.chanceBase + c.chanceNiveau * niveauDetective(cfg, d)) * (d.efficacite ?? 1));
}

/** Tarif par semaine : son niveau, le rang du musée, sa prétention. */
export function tarifDetective(cfg, etat, d) {
  const c = cfg.detectives;
  const grille = cfg.personnel.grille[etat.statut] ?? 1;
  return c.tarifBase * c.tarifNiveau ** (niveauDetective(cfg, d) - 1) * grille * (d.salaire ?? 1);
}

/** Forfait d'une mission de `semaines` semaines, en Éclats entiers. */
export function forfait(cfg, etat, d, semaines) {
  return Math.max(1, Math.round(tarifDetective(cfg, etat, d) * semaines));
}

/** Prime de celui qui ramène une œuvre : une part de son prix. */
export function prime(cfg, o) {
  return Math.round(niveauOeuvre(cfg, o.niveau).prix * cfg.detectives.prime);
}

/** Chance de la police, cette semaine, pour une œuvre. */
export function chancePolice(cfg, etat, o) {
  const regisseur = effetsPersonnel(cfg, etat).regisseur?.enquete || 0;
  return Math.min(1, cfg.securite.enquete + regisseur + (o.bonusPolice || 0));
}

/** Détectives disponibles : ceux du carnet sans mission, et les candidats de la semaine. */
export function detectivesLibres(etat, jour) {
  const d = detectivesDe(etat);
  return [...d.carnet.filter((x) => !x.mission), ...d.candidats.filter((x) => x.expire > jour)];
}

/** Tous les détectives connus, carnet et candidats. */
export function trouverDetective(etat, id) {
  const d = detectivesDe(etat);
  return d.carnet.find((x) => x.id === id) || d.candidats.find((x) => x.id === id) || null;
}

/** Les candidats de la semaine, tirés de la graine. */
export function tirerDetectives(cfg, etat, J) {
  const c = cfg.detectives;
  const alea = generateur(`${etat.graine}:detectives:${J}`);
  const max = Math.min(c.xp.length + 1, (cfg.personnel.niveauCandidatMax[etat.statut] ?? 3));
  const liste = [];
  for (let i = 0; i < c.candidatsParSemaine; i++) {
    const n = choixPondere(Array.from({ length: max }, (_, k) => [k + 1, max - k]), alea);
    const graine = `${etat.graine}:detective:${J}-${i}`;
    const nom = `${PRENOMS[entier(PRENOMS.length, generateur(`${graine}:nom`))]} ${NOMS[entier(NOMS.length, alea)]}`;
    liste.push({ id: `d${J}-${i}`, nom, xp: n > 1 ? c.xp[n - 2] : 0, ...profil(cfg, graine), expire: J + 7 });
  }
  return liste;
}

/** Une œuvre retrouvée revient en réserve, usée : réparation à l'atelier. */
function retrouver(cfg, etat, o, J, par) {
  o.lieu = 'reserve';
  delete o.voleeLe;
  delete o.bonusPolice;
  o.usure = Math.max(o.usure || 0, cfg.usure.retrouvee);
  etat.securite.historique.push({ type: 'retrouvee', jour: J, oeuvre: o.id, titre: o.titre, par: par?.nom || 'police' });
  evenement(etat, J, 'retrouvee', { oeuvre: o.id, titre: o.titre, par: par?.nom || null });
  // Les détectives de ce dossier sont libérés ; celui qui l'a ramenée
  // gagne en expérience et sa prime attend la prochaine session.
  for (const d of detectivesDe(etat).carnet) {
    if (d.mission?.oeuvre !== o.id) continue;
    delete d.mission;
  }
  if (par) {
    par.xp = (par.xp || 0) + 1;
    etat.primes = (etat.primes || 0) + prime(cfg, o);
  }
}

/**
 * Enquête hebdomadaire : pour chaque œuvre volée, la police puis chaque
 * détective tirent leur chance ; la première réussite la ramène. Sinon, des
 * pistes peuvent apparaître ; après 26 semaines, l'œuvre est perdue. Les
 * missions échues libèrent leurs détectives.
 */
export function enquetes(cfg, etat, J) {
  const s = cfg.securite;
  const c = cfg.detectives;
  const faits = [];
  const carnet = detectivesDe(etat).carnet;
  for (const o of Object.values(etat.oeuvres)) {
    if (o.lieu !== 'volee') continue;
    const alea = generateur(`${etat.graine}:enquete:${o.id}:${J}`);
    const police = alea() < chancePolice(cfg, etat, o);
    delete o.bonusPolice;
    let par = null;
    if (!police) {
      for (const d of carnet.filter((x) => x.mission?.oeuvre === o.id).sort((a, b) => a.id.localeCompare(b.id))) {
        if (alea() < chanceDetective(cfg, d)) { par = d; break; }
      }
    }
    if (police || par) {
      retrouver(cfg, etat, o, J, par);
      faits.push({ type: 'retrouvee', oeuvre: o.id, titre: o.titre, par: par?.nom || null });
      continue;
    }
    if (J - o.voleeLe >= s.enqueteSemaines * 7) {
      etat.securite.historique.push({ type: 'perdue', jour: J, oeuvre: o.id, titre: o.titre, niveau: o.niveau });
      for (const d of carnet) if (d.mission?.oeuvre === o.id) delete d.mission;
      etat.pistes = (etat.pistes || []).filter((p) => p.oeuvre !== o.id);
      delete etat.oeuvres[o.id];
      evenement(etat, J, 'perdue', { oeuvre: o.id, titre: o.titre });
      faits.push({ type: 'perdue', oeuvre: o.id, titre: o.titre });
      continue;
    }
    // Une piste : seulement si un détective travaille sur le dossier.
    if (carnet.some((d) => d.mission?.oeuvre === o.id) && alea() < c.piste.probabilite
      && !(etat.pistes || []).some((p) => p.oeuvre === o.id)) {
      const villes = c.piste.villes;
      const piste = {
        id: `p${o.id}-${J}`, oeuvre: o.id, jour: J, expire: J + c.piste.joursReponse,
        ville: villes[entier(villes.length, alea)],
        prix: Math.round(niveauOeuvre(cfg, o.niveau).prix * (cfg.cote?.[etat.statut] ?? 1) * c.piste.prixPart),
      };
      etat.pistes = [...(etat.pistes || []), piste];
      evenement(etat, J, 'piste', { oeuvre: o.id, titre: o.titre, ville: piste.ville });
      faits.push({ type: 'piste', oeuvre: o.id, titre: o.titre, ville: piste.ville });
    }
  }
  // Missions échues : le détective rentre au carnet.
  for (const d of carnet) if (d.mission && d.mission.fin <= J) delete d.mission;
  // Pistes sans réponse : l'occasion passe.
  etat.pistes = (etat.pistes || []).filter((p) => p.expire > J && etat.oeuvres[p.oeuvre]?.lieu === 'volee');
  return faits;
}

/** Rachat discret d'une piste : l'œuvre revient aussitôt. */
export function racheter(cfg, etat, piste, J) {
  const o = etat.oeuvres[piste.oeuvre];
  if (o?.lieu === 'volee') retrouver(cfg, etat, o, J, null);
  etat.pistes = (etat.pistes || []).filter((p) => p.id !== piste.id);
}
