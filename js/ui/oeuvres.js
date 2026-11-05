// Actions communes sur une œuvre, pour sa fiche et pour la vue Collection :
// l'accrocher, l'envoyer à l'atelier (réparer ou raviver), la mettre au
// repos en collection privée, la ranger en réserve.

import { h } from './dom.js';
import { feuille, couleurMur } from './composants.js';
import { espacesPublics, contenuEspace, refusAccrochage, atelierLibre } from '../moteur/batiment.js';
import { meilleurRestaurateur, typeTravaux, usure } from '../moteur/atelier.js';

export function lieuTexte(cfg, e, o) {
  switch (o.lieu) {
    case 'espace': {
      const sp = espacesPublics(e).find((x) => x.id === o.espace);
      return sp?.nom || cfg.espaces[sp?.type]?.nom || o.espace;
    }
    case 'reserve': return 'Réserve';
    case 'privee': return 'Collection privée';
    case 'atelier': return o.travaux ? (o.travaux.type === 'ravivage' ? 'Atelier · ravivage' : 'Atelier · réparation') : 'Atelier';
    case 'pret': return 'Prêtée';
    case 'exposition': return 'Exposition temporaire';
    case 'volee': return 'Volée';
    default: return o.lieu;
  }
}

/** État de conservation, en part de 1 et en mot. */
export function conservation(cfg, o) {
  const u = usure(o);
  const mot = u >= cfg.usure.maxExposable ? 'Trop abîmée' : u >= cfg.usure.aReparer ? 'À réparer' : u >= cfg.atelier.seuilReparation ? 'Usée' : 'Bon état';
  return { part: 1 - u, mot, alerte: u >= cfg.usure.aReparer };
}

/** Salles qui acceptent l'œuvre, avec une place libre. */
export function sallesPossibles(cfg, e, o) {
  return espacesPublics(e)
    .filter((sp) => !refusAccrochage(cfg, e, o, sp.id))
    .map((sp) => ({ sp, place: contenuEspace(e, sp.id).indexOf(null) }))
    .filter((x) => x.place >= 0);
}

/** Choisir la salle où accrocher l'œuvre : un appui, et elle y est. */
export function choisirSalle(app, o) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const salles = sallesPossibles(cfg, e, o);
  const rangs = new Map(espacesPublics(e).map((sp, i) => [sp.id, i]));
  const f = feuille({
    titre: 'Accrocher',
    contenu: salles.length ? h('div.pile', salles.map(({ sp, place }) => h('button.salle-choix', {
      type: 'button', style: { '--mur': couleurMur(sp, rangs.get(sp.id)) },
      onclick: async () => {
        f.fermer();
        await app.agir('deplacer', { oeuvre: o.id, vers: { lieu: 'espace', espace: sp.id, place } });
      },
    }, h('b', sp.nom || cfg.espaces[sp.type]?.nom), h('span', sp.theme ? sp.theme.libelle : 'Sans thème'),
    h('small', `${contenuEspace(e, sp.id).filter((x) => x === null).length} places libres`))))
      : h('div.vide', refusAccrochage(cfg, e, o, espacesPublics(e)[0]?.id) || 'Aucune place libre'),
  });
}

/**
 * Boutons d'action d'une œuvre et, s'il y en a, la raison qui empêche de
 * l'envoyer à l'atelier. `compact` : libellés courts pour la vue Collection.
 */
export function actionsOeuvre(app, o, { compact = false } = {}) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const boutons = [];
  let raison = null;
  if (o.travaux || ['pret', 'exposition', 'volee'].includes(o.lieu) || e.session?.oeuvre === o.id) return { boutons, raison };
  const deplacer = (vers) => app.agir('deplacer', { oeuvre: o.id, vers });
  const classe = compact ? 'bouton.petit' : 'bouton';
  const fini = o.progression >= 1;

  if (!fini) {
    if (o.lieu !== 'atelier') boutons.push(h(`button.${classe}.primaire`, { type: 'button', onclick: () => deplacer({ lieu: 'atelier' }) }, 'Restaurer'));
  } else {
    if (o.lieu !== 'espace') {
      const possibles = sallesPossibles(cfg, e, o);
      boutons.push(h(`button.${classe}.primaire`, { type: 'button', disabled: !possibles.length, onclick: () => choisirSalle(app, o) }, 'Accrocher'));
      if (!possibles.length) raison = refusAccrochage(cfg, e, o, espacesPublics(e)[0]?.id) || 'Aucune place libre en salle';
    }
    // L'atelier : réparer une œuvre usée, raviver une œuvre intacte.
    const travail = typeTravaux(cfg, o) === 'ravivage' ? 'Raviver' : 'Réparer';
    const choix = atelierLibre(cfg, e) > 0 ? meilleurRestaurateur(cfg, e, o) : null;
    boutons.push(h(`button.${classe}`, {
      type: 'button', disabled: !choix,
      onclick: () => app.agir('confierAtelier', { oeuvre: o.id }, { succes: `${travail} : ${choix.jours} j` }),
    }, choix ? `${travail} · ${choix.jours} j` : travail));
    if (!choix && !raison) raison = atelierLibre(cfg, e) <= 0 ? 'Atelier complet' : 'Aucun restaurateur libre à l\'atelier';
    if (o.lieu !== 'privee') boutons.push(h(`button.${classe}`, { type: 'button', onclick: () => deplacer({ lieu: 'privee' }) }, 'Repos'));
  }
  if (o.lieu !== 'reserve') boutons.push(h(`button.${classe}`, { type: 'button', onclick: () => deplacer({ lieu: 'reserve' }) }, 'Ranger'));
  return { boutons, raison };
}

