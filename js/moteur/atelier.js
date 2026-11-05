// Atelier (docs/ECONOMIE.md, section 4) : l'usure des œuvres exposées, les
// réparations et les ravivages que l'équipe mène en vrai temps, sans
// session. Le joueur ne restaure jamais deux fois la même œuvre : une œuvre
// abîmée (usure, vandalisme, retour de vol) est réparée par les
// restaurateurs de l'atelier, c'est-à-dire les assistants.

import { employes, niveauEmploye, efficacite } from './personnel.js';
import { evenement } from './etat.js';
import { ravivage } from './lieux.js';

/** Usure d'une œuvre : 0 intacte, 1 ruinée. */
export const usure = (o) => o?.usure || 0;

/** Ce que l'usure retire à l'attrait d'une œuvre exposée. */
export function facteurUsure(cfg, o) {
  return 1 - usure(o) * (cfg.usure?.effet ?? 0);
}

/** Une œuvre exposée s'use un peu chaque jour de visite. */
export function user(cfg, o) {
  if (!cfg.usure) return;
  o.usure = Math.min(1, Math.round((usure(o) + cfg.usure.parJour) * 10000) / 10000);
}

/** Abîmer une œuvre (vandalisme, vol) : son usure monte d'autant. */
export function abimer(o, quantite) {
  o.usure = Math.min(1, Math.round((usure(o) + quantite) * 10000) / 10000);
}

/** Restaurateurs libres : les assistants qui n'ont pas de travail en cours. */
export function restaurateursLibres(cfg, etat) {
  const occupes = new Set(Object.values(etat.oeuvres).map((o) => o.travaux?.par).filter(Boolean));
  return employes(etat, 'assistant').filter((a) => !occupes.has(a.id));
}

/** Vitesse d'un restaurateur : son niveau et son efficacité. */
export function vitesseRestaurateur(cfg, a) {
  const t = cfg.atelier;
  return (t.vitesseBase + t.vitesseNiveau * niveauEmploye(cfg, a.minutes)) * efficacite(a);
}

/** Réparation si l'œuvre est usée, sinon simple ravivage. */
export function typeTravaux(cfg, o) {
  return usure(o) >= cfg.atelier.seuilReparation ? 'reparation' : 'ravivage';
}

/** Jours de travail d'un restaurateur sur une œuvre : niveau de l'œuvre, usure. */
export function joursTravaux(cfg, o, restaurateur) {
  const t = cfg.atelier;
  const charge = t.joursBase[o.niveau] ?? 1;
  const ampleur = typeTravaux(cfg, o) === 'ravivage' ? t.ravivage : t.ravivage + t.parUsure * usure(o);
  return Math.max(1, Math.ceil(charge * ampleur / vitesseRestaurateur(cfg, restaurateur)));
}

/** Le meilleur restaurateur libre pour une œuvre : celui qui finit le plus tôt. */
export function meilleurRestaurateur(cfg, etat, o) {
  return restaurateursLibres(cfg, etat)
    .map((a) => ({ a, jours: joursTravaux(cfg, o, a) }))
    .sort((x, y) => x.jours - y.jours || x.a.id.localeCompare(y.a.id))[0] || null;
}

/**
 * Travaux achevés le jour `J` : l'œuvre ressort intacte et ravivée, et
 * retrouve sa place si elle est libre. `ramener` vient de journee.js.
 */
export function finirTravaux(cfg, etat, J, ramener) {
  const faits = [];
  for (const o of Object.values(etat.oeuvres)) {
    if (!o.travaux || o.travaux.fin > J) continue;
    const t = o.travaux;
    delete o.travaux;
    o.usure = 0;
    o.ravivee = true;
    ramener(cfg, etat, o.id, J);
    if (o.lieu === 'espace') {
      o.joursExpo = Math.min(o.joursExpo || 0, ravivage(cfg));
      delete o.ravivee;
    }
    evenement(etat, J, 'atelier', { oeuvre: o.id, titre: o.titre, travaux: t.type });
    faits.push({ type: 'atelier', oeuvre: o.id, titre: o.titre, travaux: t.type, lieu: o.lieu });
  }
  return faits;
}
