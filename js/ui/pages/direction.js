// Direction : la façade et le statut, la journée en chiffres, le billet,
// l'équipe et la sécurité, puis les écrans de gestion.

import { h, icone, nombre, grand, ajouter } from '../dom.js';
import { jauge, portrait } from '../composants.js';
import { placesPubliques } from '../../moteur/batiment.js';
import { visiteursDuJour, effetCampagnes, espacesOuverts, coutVisiteur } from '../../moteur/visiteurs.js';
import { risqueMaximal } from '../../moteur/securite.js';
import { avecNiveaux, masseSalariale } from '../../moteur/personnel.js';
import { frequentationAnnualisee, prixOptimal } from '../../moteur/regles.js';

const decimale = (x) => x.toLocaleString('fr-FR', { maximumFractionDigits: x < 10 ? 1 : 0 });

export async function afficher(app, vue) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const jour = jeu.jour();

  ajouter(vue,
    app.installation ? h('button.bouton.primaire.plein.installer', { type: 'button', onclick: () => app.installer() }, 'Installer l\'application') : null,
    facade(e, cfg),
    chiffres(app, e, cfg, jour),
    h('div.pile', { style: { marginTop: '12px' } }, equipe(e, cfg, jour), securite(e, cfg, jour)),
    h('div.section', h('h2', 'Gestion')),
    h('div.entrees',
      entree('investir', 'Investissements', 'investir'),
      entree('expositions', 'Expositions et prêts', 'expositions', e.prets.demande ? 'Demande' : (e.expositions.courante ? 'En cours' : null)),
      entree('collection', 'Collection', 'reserve', `${Object.keys(e.oeuvres).length} œuvres`),
      entree('classement', 'Classement', 'classement', e.classement?.rang ? `${nombre(e.classement.rang)}e` : null),
      entree('rapport', 'Rapport', 'rapport'),
      entree('historique', 'Historique', 'historique'),
      entree('reglages', 'Réglages', 'reglages')),
    app.demo ? h('p.tres-discret', { style: { marginTop: '18px', textAlign: 'center' } }, 'Démonstration · Éclats fictifs') : null,
  );
}

function entree(route, nom, ic, aside) {
  return h('a.entree', { href: `#/${route}` }, icone(ic), h('span', nom), aside ? h('span.puce', aside) : null, icone('droite'));
}

function facade(e, cfg) {
  const annualisee = frequentationAnnualisee(cfg, e.historique);
  const suivant = cfg.statuts[e.statut + 1];
  return h('div.facade',
    h('div.plaque', cfg.statuts[e.statut].nom, h('small', `${grand(annualisee)} visiteurs par an`)),
    suivant ? h('div.prochain',
      jauge(annualisee / suivant.seuil),
      h('div.ligne.espace', h('span', suivant.nom), h('span', grand(suivant.seuil)))) : null);
}

function chiffres(app, e, cfg, jour) {
  const v = visiteursDuJour(cfg, e, jour);
  const hier = e.historique[e.historique.length - 1];
  const places = placesPubliques(e);
  const campagne = effetCampagnes(cfg, e, jour) > 1 ? cfg.campagnes.find((c) => c.id === e.campagne.id) : null;
  return h('div.chiffres', { style: { marginTop: '12px' } },
    h('div.chiffre', h('span', icone('visiteurs'), 'Visiteurs par jour'), h('b', nombre(v)),
      h('small', [hier ? `Hier ${nombre(hier.visiteurs)}` : null, campagne?.nom].filter(Boolean).join(' · ') || null)),
    h('div.chiffre', h('span', icone('reputation'), 'Réputation'), h('b', Math.round(e.reputation)),
      h('small', `Satisfaction ${Math.round(e.satisfaction)}`)),
    h('div.chiffre',
      h('span', icone('billet'), 'Billet'),
      h('div.billet',
        h('button.bouton.petit.icone-seule', { type: 'button', 'aria-label': 'Baisser le prix', disabled: e.prixBillet <= 0, onclick: () => app.agir('fixerPrix', e.prixBillet - 1) }, icone('retirer')),
        h('b', e.prixBillet === 0 ? 'Gratuit' : `${e.prixBillet} ✦`),
        h('button.bouton.petit.icone-seule', { type: 'button', 'aria-label': 'Augmenter le prix', disabled: e.prixBillet >= cfg.visiteurs.prix.max, onclick: () => app.agir('fixerPrix', e.prixBillet + 1) }, icone('ajouter'))),
      // Le billet qui rapporte le plus couvre d'abord le coût d'un visiteur.
      h('small', `Coût d'un visiteur ${decimale(coutVisiteur(cfg, e))} ✦ · optimal ${Math.max(1, Math.round(prixOptimal(cfg, e.reputation) + coutVisiteur(cfg, e)))} ✦`)),
    h('div.chiffre', h('span', icone('musee'), 'Places'), h('b', nombre(places)),
      h('small', `Densité ${places ? Math.round(v / places) : 0}`)));
}

function equipe(e, cfg, jour) {
  const membres = avecNiveaux(cfg, e);
  const fermes = espacesOuverts(cfg, e, jour).fermes.length;
  const candidats = (e.personnel?.candidats || []).filter((c) => c.expire > jour).length;
  const arrieres = e.personnel?.arrieres || 0;
  const alerte = fermes ? `${fermes} salle${fermes > 1 ? 's' : ''} fermée${fermes > 1 ? 's' : ''}` : (arrieres > 0 ? `Arriérés ${nombre(arrieres)} ✦` : null);
  return h('a.carte.equipe', { href: '#/personnel', style: { textDecoration: 'none', color: 'inherit' } },
    membres.length
      ? h('div.equipe-portraits', membres.slice(0, 4).map((m) => portrait(m.nom)))
      : h('span.portrait', { style: { display: 'grid', placeItems: 'center', color: 'var(--accent)' } }, icone('personnel')),
    h('div', { style: { flex: 1, minWidth: 0 } },
      h('b', 'Personnel'),
      h('div.tres-discret', `${nombre(membres.length)} · ${decimale(masseSalariale(cfg, e))} ✦/h`),
      alerte ? h('div.tres-discret', { style: { color: 'var(--rouge)' } }, alerte) : null),
    candidats ? h('span.puce', `${candidats} candidats`) : null,
    icone('droite'));
}

function securite(e, cfg, jour) {
  const risque = risqueMaximal(cfg, e, jour);
  return h('a.carte.equipe', { href: '#/securite', style: { textDecoration: 'none', color: 'inherit' } },
    h('span.portrait', { style: { display: 'grid', placeItems: 'center', color: 'var(--accent)' } }, icone('securite')),
    h('div', { style: { flex: 1, minWidth: 0 } },
      h('b', 'Sécurité'),
      h('div.tres-discret', { style: { color: risque > 0.05 ? 'var(--rouge)' : null } },
        `Pire risque ${(risque * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % par semaine`)),
    icone('droite'));
}
