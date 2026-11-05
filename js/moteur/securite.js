// Sécurité (docs/ECONOMIE.md, section 3), salle par salle. Deux menaces, le
// vol et le vandalisme, tirées chaque jour pour chaque espace : salles
// publiques, exposition temporaire, réserve, atelier. La collection privée
// est à l'abri. Le risque d'un espace vient des œuvres qui s'y trouvent, sa
// protection du matériel qui y est installé, des agents qui le couvrent, et
// du matériel commun (portiques, drones).

import { prestige, borner, niveau } from './regles.js';
import { effetsPersonnel, employes, avecNiveaux, efficacite, role } from './personnel.js';
import { visiteursDuJour } from './visiteurs.js';
import { placesPubliques, espacesPublics } from './batiment.js';
import { generateur, choixPondere, entier } from './alea.js';
import { evenement } from './etat.js';
import { sortirDuPublic } from './lieux.js';
import { abimer } from './atelier.js';

export const MENACES = ['vol', 'vandalisme'];

/* ---------- Espaces ---------- */

/** Espaces sous surveillance : { id, nom, type ('public', 'exposition', 'reserve', 'atelier'), places }. */
export function lieuxSecurises(cfg, etat) {
  const l = espacesPublics(etat).map((e) => ({ id: e.id, nom: e.nom || cfg.espaces[e.type]?.nom || e.id, type: 'public', places: e.places }));
  if (etat.batiment.exposition) l.push({ id: 'exposition', nom: cfg.espaces.exposition.nom, type: 'exposition', places: etat.batiment.exposition.places });
  l.push({ id: 'reserve', nom: 'Réserve', type: 'reserve', places: etat.batiment.reserve.places });
  l.push({ id: 'atelier', nom: 'Atelier', type: 'atelier', places: 6 });
  return l;
}

/** Matériel installé dans un espace. */
export function materielDe(etat, lieu) {
  return etat.securite?.salles?.[lieu] || [];
}

const publicOuExpo = (type) => type === 'public' || type === 'exposition';

/** Le matériel `m` peut-il s'installer dans un espace de ce type ? */
export function materielPossible(m, type) {
  const lieux = m.lieux || ['public'];
  return lieux.includes(type) || (publicOuExpo(type) && lieux.includes('public'));
}

/** Prix d'un matériel pour un espace : il suit la taille de la salle. */
export function prixMateriel(m, lieu) {
  return Math.round(m.prix * Math.max(1, (lieu.places || 6) / 6));
}

/** Niveau de sécurité (norme) d'un espace : Chefs-d'œuvre au niveau 1, Trésors au 2. */
export function normeDe(cfg, etat, lieu) {
  let n = 0;
  for (const id of materielDe(etat, lieu)) n = Math.max(n, cfg.materielSalle.find((m) => m.id === id)?.norme || 0);
  return n;
}

/** Espaces couverts par un agent. */
export const affectation = (x) => x.affectation || [];

/* ---------- Œuvres et risque ---------- */

/** Espace où se trouve une œuvre, du point de vue de la sécurité, ou null (à l'abri). */
function lieuOeuvre(o) {
  if (o.lieu === 'espace') return o.espace;
  if (o.lieu === 'exposition' || o.lieu === 'reserve' || o.lieu === 'atelier') return o.lieu;
  return null;
}

/** Affluence d'un espace public : plus la foule est dense, plus un vol passe inaperçu. */
function affluence(cfg, etat, jour) {
  const a = cfg.securite.affluence;
  const places = placesPubliques(etat);
  if (!places) return 0.5;
  const densite = visiteursDuJour(cfg, etat, jour ?? etat.jourFerme + 1) / places;
  return Math.min(a.max, 0.5 + densite / a.densiteRef);
}

/** Poids d'une œuvre dans le risque de vol de son espace. */
function poidsVol(cfg, etat, o, type, aff) {
  const s = cfg.securite;
  if (publicOuExpo(type)) return (s.portabilite[o.support] ?? 1) * aff;
  if (type === 'reserve') return materielDe(etat, 'reserve').some((id) => cfg.materielSalle.find((m) => m.id === id)?.blindage) ? s.poids.reserveBlindee : s.poids.reserve;
  return s.poids[type] ?? 0;
}

const celebrite = (cfg, n) => prestige(cfg, n) ** cfg.securite.menaces.vandalisme.exposant / cfg.securite.menaces.vandalisme.diviseur;

/** Ce qui attire chaque menace, espace par espace : { [lieu]: { vol, vandalisme } }. */
export function risques(cfg, etat, jour) {
  const lieux = lieuxSecurises(cfg, etat);
  const types = new Map(lieux.map((l) => [l.id, l.type]));
  const r = Object.fromEntries(lieux.map((l) => [l.id, { vol: 0, vandalisme: 0 }]));
  const aff = affluence(cfg, etat, jour);
  for (const o of Object.values(etat.oeuvres)) {
    const l = lieuOeuvre(o);
    if (!l || !r[l]) continue;
    const type = types.get(l);
    r[l].vol += prestige(cfg, o.niveau) * poidsVol(cfg, etat, o, type, aff);
    if (publicOuExpo(type)) r[l].vandalisme += celebrite(cfg, o.niveau);
  }
  for (const em of etat.expositions?.courante?.emprunts || []) {
    if (!r.exposition) continue;
    r.exposition.vol += prestige(cfg, em.niveau) * (cfg.securite.portabilite[em.support] ?? 1) * aff;
    r.exposition.vandalisme += celebrite(cfg, em.niveau);
  }
  return r;
}

/* ---------- Protection ---------- */

/**
 * Protection de chaque espace : son matériel (renforcé par le technicien,
 * réduit sans l'agent qu'il requiert), le matériel commun, et les agents qui
 * le couvrent (leur force se partage entre leurs salles ; le chef de la
 * sécurité renforce toute l'équipe).
 */
export function protections(cfg, etat) {
  const ep = effetsPersonnel(cfg, etat);
  const lieux = lieuxSecurises(cfg, etat);
  const p = Object.fromEntries(lieux.map((l) => [l.id, { vol: 0, vandalisme: 0 }]));
  const equipe = avecNiveaux(cfg, etat);
  const chef = role(cfg, 'chefSecurite');
  const meilleurChef = equipe.filter((x) => x.role === 'chefSecurite').reduce((m, x) => (!m || x.niveau * efficacite(x) > m.niveau * efficacite(m) ? x : m), null);
  const kChef = meilleurChef ? 1 + (chef.humainBase + chef.humainNiveau * meilleurChef.niveau) * efficacite(meilleurChef) : 1;
  const presents = (lieu, metier) => equipe.some((x) => x.role === metier && affectation(x).includes(lieu));

  for (const l of lieux) {
    for (const id of materielDe(etat, l.id)) {
      const m = cfg.materielSalle.find((x) => x.id === id);
      if (!m) continue;
      let k = m.electronique ? 1 + ep.technicien : 1;
      if (m.requiert && !presents(l.id, m.requiert)) k *= m.sans ?? 0;
      for (const menace of MENACES) if (m[menace]) p[l.id][menace] += m[menace] * k;
    }
  }
  // Matériel commun : les portiques filtrent l'entrée des salles publiques,
  // les drones survolent tout le bâtiment.
  for (const id of etat.investissements || []) {
    const f = cfg.investissements.find((i) => i.id === id)?.effets;
    if (!f || !MENACES.some((m) => f[m])) continue;
    let k = f.electronique ? 1 + ep.technicien : 1;
    if (f.requiert && !employes(etat, f.requiert).length) k *= f.sans ?? 0;
    for (const l of lieux) {
      if (f.vandalisme && publicOuExpo(l.type)) p[l.id].vandalisme += f.vandalisme * k;
      if (f.vol) p[l.id].vol += f.vol * k;
    }
  }
  for (const x of equipe) {
    const menaces = role(cfg, x.role)?.menaces;
    const couvre = affectation(x).filter((id) => p[id]);
    if (!menaces || !couvre.length) continue;
    for (const id of couvre) {
      for (const [m, v] of Object.entries(menaces)) if (p[id][m] !== undefined) p[id][m] += v * x.niveau * efficacite(x) * kChef / couvre.length;
    }
  }
  return p;
}

/** Probabilité de chaque menace par jour, espace par espace. */
export function probabilites(cfg, etat, jour) {
  const r = risques(cfg, etat, jour);
  const s = protections(cfg, etat);
  const p = {};
  for (const [lieu, rl] of Object.entries(r)) {
    p[lieu] = {};
    for (const m of MENACES) {
      const c = cfg.securite.menaces[m];
      p[lieu][m] = rl[m] > 0 ? borner(c.base * rl[m] / (s[lieu][m] + c.plancher), c.min, c.max) : 0;
    }
  }
  return p;
}

/** D'une probabilité par jour à une probabilité sur la semaine. */
export const semaine = (pJour) => 1 - (1 - pJour) ** 7;

/** Risque sur la semaine de chaque menace pour tout le musée (au moins un incident). */
export function risqueMusee(cfg, etat, jour) {
  const p = probabilites(cfg, etat, jour);
  const r = {};
  for (const m of MENACES) r[m] = 1 - Object.values(p).reduce((q, x) => q * (1 - x[m]) ** 7, 1);
  return r;
}

/** Risque sur la semaine (vol ou vandalisme) de l'espace public le plus exposé. */
export function risqueMaximal(cfg, etat, jour) {
  const p = probabilites(cfg, etat, jour);
  const lieux = lieuxSecurises(cfg, etat).filter((l) => publicOuExpo(l.type));
  return Math.max(0, ...lieux.map((l) => 1 - ((1 - p[l.id].vol) * (1 - p[l.id].vandalisme)) ** 7));
}

/** Un musée prête-t-il une œuvre de ce niveau ? */
export function seuilEmprunt(cfg, niveauOeuvre) {
  return cfg.securite.seuilsEmprunt?.[niveauOeuvre] ?? null;
}

export function peutEmprunter(cfg, etat, niveauOeuvre, jour) {
  const seuil = seuilEmprunt(cfg, niveauOeuvre);
  return seuil === null || risqueMaximal(cfg, etat, jour) <= seuil;
}

/** Chance hebdomadaire de retrouver une œuvre volée. */
export function chanceEnquete(cfg, etat) {
  return Math.min(1, cfg.securite.enquete + effetsPersonnel(cfg, etat).enquete);
}

/* ---------- Tirages quotidiens ---------- */

function retirer(etat, o, J) {
  if (o.lieu === 'espace' || o.lieu === 'exposition') sortirDuPublic(o, J);
  if (o.lieu === 'exposition') {
    const x = etat.expositions.courante;
    if (x) x.oeuvres = x.oeuvres.filter((id) => id !== o.id);
  }
  delete o.espace;
  delete o.place;
  delete o.retour;
}

/** Un incident fait baisser la réputation, et durablement la confiance. */
function perdreReputation(cfg, etat, m) {
  const c = cfg.securite.menaces[m];
  etat.reputation = Math.max(0, etat.reputation - c.reputation);
  etat.bonusPermanents = (etat.bonusPermanents || 0) - (c.confiance || 0);
}

/**
 * Les tirages du jour `J`, espace par espace, à une heure tirée au hasard.
 * Chaque tirage a sa graine : serveur et application obtiennent le même
 * résultat. L'œuvre visée l'est au prorata de ce qui attire la menace.
 */
export function tirages(cfg, etat, J) {
  const faits = [];
  const p = probabilites(cfg, etat, J);
  const lieux = lieuxSecurises(cfg, etat);
  const aff = affluence(cfg, etat, J);
  for (const l of lieux) {
    for (const m of MENACES) {
      if (!(p[l.id]?.[m] > 0)) continue;
      const alea = generateur(`${etat.graine}:${m}:${l.id}:${J}`);
      if (!(alea() < p[l.id][m])) continue;
      const heure = entier(24, alea);
      const ici = Object.values(etat.oeuvres).filter((o) => lieuOeuvre(o) === l.id && etat.session?.oeuvre !== o.id && !o.travaux);
      if (m === 'vol') {
        const o = choixPondere(ici.map((x) => [x, prestige(cfg, x.niveau) * poidsVol(cfg, etat, x, l.type, aff)]), alea);
        if (!o) continue;
        retirer(etat, o, J);
        o.lieu = 'volee';
        o.voleeLe = J;
        perdreReputation(cfg, etat, m);
        const taux = cfg.charges?.assurance?.indemnite || 0;
        if (taux) etat.indemnites = (etat.indemnites || 0) + Math.round(niveau(cfg, o.niveau).prix * taux);
        etat.securite.historique.push({ type: 'vol', jour: J, heure, lieu: l.id, oeuvre: o.id, titre: o.titre, niveau: o.niveau, probabilite: p[l.id][m] });
        evenement(etat, J, 'cambriolage', { oeuvre: o.id, titre: o.titre, lieu: l.nom, heure });
        faits.push({ type: 'cambriolage', oeuvre: o.id, titre: o.titre, lieu: l.nom, heure });
      } else {
        const o = choixPondere(ici.map((x) => [x, celebrite(cfg, x.niveau)]), alea);
        if (!o) continue;
        // L'œuvre abîmée est décrochée et part en réserve, d'où on l'envoie
        // en réparation à l'atelier.
        const [min, max] = cfg.usure.vandalisme;
        const degats = min + (max - min) * alea();
        retirer(etat, o, J);
        o.lieu = 'reserve';
        abimer(o, degats);
        perdreReputation(cfg, etat, m);
        etat.securite.historique.push({ type: 'vandalisme', jour: J, heure, lieu: l.id, oeuvre: o.id, titre: o.titre, niveau: o.niveau, degats, probabilite: p[l.id][m] });
        evenement(etat, J, 'vandalisme', { oeuvre: o.id, titre: o.titre, lieu: l.nom, degats: Math.round(degats * 100) });
        faits.push({ type: 'vandalisme', oeuvre: o.id, titre: o.titre, lieu: l.nom, degats: Math.round(degats * 100) });
      }
    }
  }
  return faits;
}

/** Enquête hebdomadaire : retrouvée (abîmée), toujours cherchée, ou perdue. */
export function enquete(cfg, etat, J) {
  const s = cfg.securite;
  const faits = [];
  const chance = chanceEnquete(cfg, etat);
  for (const o of Object.values(etat.oeuvres)) {
    if (o.lieu !== 'volee') continue;
    const alea = generateur(`${etat.graine}:enquete:${o.id}:${J}`);
    if (alea() < chance) {
      o.lieu = 'reserve';
      delete o.voleeLe;
      // Elle revient abîmée : réparation à l'atelier.
      o.usure = Math.max(o.usure || 0, cfg.usure.retrouvee);
      etat.securite.historique.push({ type: 'retrouvee', jour: J, oeuvre: o.id, titre: o.titre });
      evenement(etat, J, 'retrouvee', { oeuvre: o.id, titre: o.titre });
      faits.push({ type: 'retrouvee', oeuvre: o.id, titre: o.titre });
    } else if (J - o.voleeLe >= s.enqueteSemaines * 7) {
      etat.securite.historique.push({ type: 'perdue', jour: J, oeuvre: o.id, titre: o.titre, niveau: o.niveau });
      delete etat.oeuvres[o.id];
      evenement(etat, J, 'perdue', { oeuvre: o.id, titre: o.titre });
      faits.push({ type: 'perdue', oeuvre: o.id, titre: o.titre });
    }
  }
  return faits;
}

/* ---------- Affectation par défaut ---------- */

/** Valeur exposée d'un espace : où un agent sert le plus. */
export function valeurLieu(cfg, etat, lieu) {
  return Object.values(etat.oeuvres).filter((o) => lieuOeuvre(o) === lieu).reduce((s, o) => s + prestige(cfg, o.niveau), 0);
}

/**
 * Affecte un agent sans affectation : un gardien à la salle garnie la plus
 * précieuse qu'aucun gardien ne couvre, les autres à l'espace le plus
 * précieux. Renvoie la liste des espaces.
 */
export function affectationParDefaut(cfg, etat, agent) {
  const lieux = lieuxSecurises(cfg, etat)
    .map((l) => ({ ...l, valeur: valeurLieu(cfg, etat, l.id) }))
    .sort((a, b) => b.valeur - a.valeur || String(a.id).localeCompare(String(b.id)));
  if (agent.role === 'gardien') {
    const gardes = new Set(employes(etat, 'gardien').filter((g) => g.id !== agent.id).flatMap(affectation));
    const libre = lieux.find((l) => publicOuExpo(l.type) && !gardes.has(l.id) && l.valeur > 0)
      || lieux.find((l) => publicOuExpo(l.type) && !gardes.has(l.id));
    return libre ? [libre.id] : [];
  }
  return lieux.length ? [lieux[0].id] : [];
}
