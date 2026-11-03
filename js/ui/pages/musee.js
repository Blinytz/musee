// Écran Musée : façade et statut, chiffres du jour, billet, plan des ailes et
// des salles, accrochage par glisser-déposer.

import { h, vider, icone, nombre, grand, pourcent, siecleTexte, ajouter, majuscule } from '../dom.js';
import { feuille, miniature, puceNiveau, jauge, tenter, annoncer, messageErreur } from '../composants.js';
import { espacesPublics, contenuEspace, refusAccrochage, placesPubliques } from '../../moteur/batiment.js';
import { visiteursDuJour, effetCampagnes, espacesOuverts } from '../../moteur/visiteurs.js';
import { risqueMaximal } from '../../moteur/securite.js';
import { masseSalariale } from '../../moteur/personnel.js';
import { frequentationAnnualisee, estConforme, valeurTheme, prixOptimal } from '../../moteur/regles.js';

export async function afficher(app, vue) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const jour = jeu.jour();
  const fiches = new Map();
  const ids = Object.keys(e.oeuvres).map(Number);
  (await app.catalogue.fiches(ids)).forEach((f, i) => fiches.set(ids[i], f));

  ajouter(vue, 
    facade(app, e, cfg),
    chiffres(app, e, cfg, jour),
    plan(app, e, cfg, fiches, jour, espacesOuverts(cfg, e, jour)),
  );
  return activerGlisser(app, vue);
}

function facade(app, e, cfg) {
  const annualisee = frequentationAnnualisee(cfg, e.historique);
  const suivant = cfg.statuts[e.statut + 1];
  return h('div.facade', { classe: `statut-${e.statut}` },
    h('div.tres-discret', 'Statut'),
    h('div.statut-nom', cfg.statuts[e.statut].nom),
    h('div.prochain',
      h('div.ligne.espace', h('span', `${grand(annualisee)} visiteurs par an`),
        suivant ? h('span', grand(suivant.seuil)) : null),
      suivant ? jauge(annualisee / suivant.seuil) : null,
      suivant ? h('span', suivant.nom) : null));
}

function chiffres(app, e, cfg, jour) {
  const v = visiteursDuJour(cfg, e, jour);
  const hier = e.historique[e.historique.length - 1];
  const campagne = effetCampagnes(cfg, e, jour) > 1 ? cfg.campagnes.find((c) => c.id === e.campagne.id) : null;
  const billet = h('div.chiffre',
    h('span', icone('billet'), 'Billet'),
    h('div.ligne', { style: { justifyContent: 'space-between' } },
      h('button.bouton.petit.icone-seule', { type: 'button', 'aria-label': 'Baisser le prix', disabled: e.prixBillet <= 0, onclick: () => app.agir('fixerPrix', e.prixBillet - 1) }, icone('retirer')),
      h('b', e.prixBillet === 0 ? 'Gratuit' : `${e.prixBillet} ✦`),
      h('button.bouton.petit.icone-seule', { type: 'button', 'aria-label': 'Augmenter le prix', disabled: e.prixBillet >= cfg.visiteurs.prix.max, onclick: () => app.agir('fixerPrix', e.prixBillet + 1) }, icone('ajouter'))),
    h('small', `Optimal ${prixOptimal(cfg, e.reputation).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ✦`));
  return h('div.chiffres', { style: { marginTop: '10px' } },
    h('div.chiffre', h('span', icone('visiteurs'), 'Visiteurs par jour'), h('b', nombre(v)),
      hier ? h('small', `Hier ${nombre(hier.visiteurs)}`) : null,
      campagne ? h('small', { style: { color: 'var(--accent)' } }, ` · ${campagne.nom}`) : null),
    h('div.chiffre', h('span', icone('reputation'), 'Réputation'), h('b', Math.round(e.reputation)),
      h('small', `Satisfaction ${Math.round(e.satisfaction)}`)),
    billet,
    h('div.chiffre', h('span', icone('visiteurs'), 'Places'), h('b', nombre(placesPubliques(e))),
      h('small', `Densité ${placesPubliques(e) ? Math.round(v / placesPubliques(e)) : 0}`)),
    h('a.chiffre', { href: '#/personnel', style: { textDecoration: 'none', color: 'inherit' } },
      h('span', icone('visiteurs'), 'Personnel'), h('b', nombre(e.personnel?.employes.length || 0)),
      h('small', `${masseSalariale(cfg, e).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ✦/h`)),
    h('a.chiffre', { href: '#/securite', style: { textDecoration: 'none', color: 'inherit' } },
      h('span', icone('privee'), 'Sécurité'),
      h('b', { style: { color: risqueMaximal(cfg, e, jour) > 0.05 ? 'var(--rouge)' : null } },
        `${(risqueMaximal(cfg, e, jour) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`),
      h('small', 'pire risque par semaine')));
}

/* ---------- Plan ---------- */

function plan(app, e, cfg, fiches, jour, ouverture) {
  const racine = h('div');
  const espaces = espacesPublics(e);
  for (let a = 1; a <= e.batiment.ailes; a++) {
    const salles = espaces.filter((s) => s.type === 'salle' && s.aile === a);
    ajouter(racine, h('div.aile',
      h('div.aile-titre', `Aile ${a}`),
      salles.length ? salles.map((s) => salle(app, e, cfg, s, fiches, ouverture)) : h('div.vide', { style: { padding: '12px' } },
        h('a', { href: '#/investir' }, 'Ajouter une salle'))));
  }
  const speciaux = espaces.filter((s) => s.type !== 'salle');
  if (speciaux.length) {
    ajouter(racine, h('div.aile', h('div.aile-titre', 'Espaces'), speciaux.map((s) => salle(app, e, cfg, s, fiches, ouverture))));
  }
  const x = e.expositions.courante;
  if (e.batiment.exposition) {
    ajouter(racine, h('div.aile', h('div.aile-titre', 'Exposition temporaire'),
      h('a.salle', { href: '#/expositions', style: { display: 'block', textDecoration: 'none', color: 'inherit' } },
        x ? [h('h3', x.theme.libelle), h('div.tres-discret', `${x.oeuvres.length + x.emprunts.length} œuvres · ${x.fin - jour} j restants`)]
          : h('div.tres-discret', 'Aucune exposition en cours'))));
  }
  ajouter(racine, bac(app, e, cfg, fiches));
  return h('div', h('div.section', h('h2', 'Salles')), racine);
}

function salle(app, e, cfg, s, fiches, ouverture) {
  const contenu = contenuEspace(e, s.id);
  const theme = s.theme;
  const conformes = contenu.filter((id) => id !== null && estConforme(e.oeuvres[id], theme)).length;
  const garnies = contenu.filter((id) => id !== null).length;
  const fermee = ouverture?.fermes.includes(s.id);
  return h('div.salle', { dataset: { espace: s.id }, classe: fermee ? 'fermee' : '' },
    h('div.salle-tete',
      h('h3', s.nom || cfg.espaces[s.type]?.nom || s.id),
      fermee ? h('a.puce', { href: '#/personnel', style: { background: 'rgba(255,116,102,0.18)', color: 'var(--rouge)', textDecoration: 'none' } }, 'Fermée') : null,
      h('button.puce', { type: 'button', onclick: () => choisirTheme(app, e, cfg, s) },
        theme ? `${theme.libelle}${garnies ? ` · ${conformes}/${garnies}` : ''}` : 'Sans thème'),
      h('span.tres-discret', `${garnies}/${s.places}`)),
    h('div.places', contenu.map((id, i) => {
      const o = id !== null ? e.oeuvres[id] : null;
      return h('button.place', {
        type: 'button',
        classe: o ? 'occupee' : '',
        dataset: { espace: s.id, place: i, ...(o ? { oeuvre: id } : {}) },
        'aria-label': o ? o.titre : 'Place libre',
        onclick: () => (o ? app.naviguer(`oeuvre/${id}`) : choisirOeuvre(app, e, cfg, s, i, fiches)),
      }, o ? [miniature(app, { id, fiche: fiches.get(id), oeuvre: o }), theme && !estConforme(o, theme) ? h('span.hors-theme') : null]
        : icone('ajouter'));
    })));
}

/** Œuvres restaurées disponibles pour l'accrochage, glissables vers une place. */
function bac(app, e, cfg, fiches) {
  const libres = Object.values(e.oeuvres).filter((o) => o.progression >= 1 && (o.lieu === 'reserve' || o.lieu === 'privee' || o.lieu === 'atelier'));
  return h('div', { style: { marginTop: '6px' } },
    h('div.section', h('h3', 'À accrocher'), h('span.aside', libres.length)),
    h('div.bac', { dataset: { bac: '1' } },
      libres.length ? libres.map((o) => h('button.place.occupee', {
        type: 'button', dataset: { oeuvre: o.id, origine: o.lieu }, 'aria-label': o.titre,
        onclick: () => app.naviguer(`oeuvre/${o.id}`),
      }, miniature(app, { id: o.id, fiche: fiches.get(o.id), oeuvre: o })))
        : h('div.tres-discret', { style: { padding: '14px 4px' } }, 'Réserve vide')));
}

/* ---------- Choix ---------- */

function choisirOeuvre(app, e, cfg, s, place, fiches) {
  const candidates = Object.values(e.oeuvres)
    .filter((o) => o.lieu !== 'espace' || o.espace !== s.id)
    .filter((o) => !refusAccrochage(cfg, e, o, s.id))
    .filter((o) => ['reserve', 'privee', 'atelier', 'espace'].includes(o.lieu))
    .sort((a, b) => (a.lieu === 'espace') - (b.lieu === 'espace') || b.niveau - a.niveau);
  const f = feuille({
    titre: s.nom || cfg.espaces[s.type]?.nom,
    contenu: candidates.length ? h('div.pile', candidates.map((o) => h('button.carte.ligne', {
      type: 'button', style: { textAlign: 'left', width: '100%' },
      onclick: async () => {
        f.fermer();
        await app.agir('deplacer', { oeuvre: o.id, vers: { lieu: 'espace', espace: s.id, place } });
      },
    },
    h('div', { style: { width: '48px', height: '60px', flex: 'none', borderRadius: '6px', overflow: 'hidden' } }, miniature(app, { id: o.id, fiche: fiches.get(o.id), oeuvre: o })),
    h('div', { style: { flex: 1, minWidth: 0 } },
      h('div', { style: { fontFamily: 'var(--titre)', fontSize: '17px' } }, o.titre),
      h('div.tres-discret', [o.artiste?.nom, lieuTexte(e, o)].filter(Boolean).join(' · '))),
    puceNiveau(cfg, o.niveau))))
      : h('div.vide', 'Aucune œuvre restaurée ne peut aller ici'),
  });
}

function lieuTexte(e, o) {
  if (o.lieu === 'espace') return e.batiment.salles.find((s) => s.id === o.espace)?.nom || o.espace;
  return { reserve: 'Réserve', privee: 'Collection privée', atelier: 'Atelier' }[o.lieu] || '';
}

/** Valeurs de thème possibles, tirées des œuvres possédées. */
export function valeursTheme(cfg, e, type) {
  const vues = new Map();
  for (const o of Object.values(e.oeuvres)) {
    const v = valeurTheme(o, type);
    if (v === null) continue;
    let libelle;
    if (type === 'artiste') libelle = o.artiste?.nom;
    else if (type === 'mouvement') libelle = majuscule(o.mouvement?.nom);
    else if (type === 'pays') libelle = majuscule(o.pays?.nom);
    else if (type === 'siecle') libelle = siecleTexte(v);
    else libelle = cfg.supports.find((x) => x.id === v)?.pluriel || v;
    const prec = vues.get(v);
    vues.set(v, { valeur: v, libelle, n: (prec?.n || 0) + 1 });
  }
  return [...vues.values()].sort((a, b) => b.n - a.n || String(a.libelle).localeCompare(String(b.libelle)));
}

function choisirTheme(app, e, cfg, s) {
  let type = s.theme?.type || 'mouvement';
  const liste = h('div.pile');
  const onglets = h('div.onglets');
  const nom = h('input', { type: 'text', value: s.nom || '', maxlength: 40, placeholder: 'Nom' });
  function dessiner() {
    vider(onglets, ...cfg.themes.map((t) => h('button', {
      type: 'button', classe: t.id === type ? 'actif' : '', onclick: () => { type = t.id; dessiner(); },
    }, t.nom)));
    const valeurs = valeursTheme(cfg, e, type);
    vider(liste, 
      h('button.bouton.plein', { type: 'button', onclick: () => appliquer(null) }, 'Sans thème'),
      ...valeurs.map((v) => h('button.carte.ligne.espace', {
        type: 'button', style: { width: '100%' },
        classe: s.theme?.type === type && s.theme?.valeur === v.valeur ? 'actif' : '',
        onclick: () => appliquer({ type, valeur: v.valeur, libelle: v.libelle }),
      }, h('span', v.libelle), h('span.tres-discret', v.n))),
      valeurs.length ? null : h('div.vide', 'Aucune œuvre ne porte ce critère'));
  }
  async function appliquer(theme) {
    f.fermer();
    await app.agir('definirTheme', { espace: s.id, theme });
  }
  dessiner();
  const f = feuille({
    titre: s.nom || cfg.espaces[s.type]?.nom,
    contenu: h('div.pile',
      s.type === 'salle' ? h('form.ligne', {
        onsubmit: async (ev) => { ev.preventDefault(); f.fermer(); await app.agir('renommerSalle', { espace: s.id, nom: nom.value }); },
      }, nom, h('button.bouton', { type: 'submit' }, 'Renommer')) : null,
      onglets, liste),
  });
}

/* ---------- Glisser-déposer ---------- */

/**
 * Glisser une œuvre (place occupée ou bac) vers une place, ou vers le bac
 * pour la décrocher. Souris : dès que le pointeur bouge. Doigt : après un
 * appui long, pour laisser le défilement normal au simple glissé.
 */
function activerGlisser(app, racine) {
  let etat = null;

  function demarrer(ev) {
    const source = ev.target.closest('[data-oeuvre]');
    if (!source || ev.button > 0) return;
    const tactile = ev.pointerType === 'touch';
    etat = {
      source, id: Number(source.dataset.oeuvre), x: ev.clientX, y: ev.clientY,
      actif: false, fantome: null, cible: null, tactile,
      minuterie: tactile ? setTimeout(() => activer(), 260) : null,
    };
  }

  function activer() {
    if (!etat || etat.actif) return;
    etat.actif = true;
    etat.fantome = h('div.fantome', etat.source.firstElementChild?.cloneNode(true));
    const c = etat.source.querySelector('canvas');
    const copie = etat.fantome.querySelector('canvas');
    if (c && copie) copie.getContext('2d').drawImage(c, 0, 0);
    ajouter(document.body, etat.fantome);
    placerFantome(etat.x, etat.y);
    navigator.vibrate?.(12);
  }

  function placerFantome(x, y) {
    etat.fantome.style.left = `${x}px`;
    etat.fantome.style.top = `${y}px`;
  }

  function bouger(ev) {
    if (!etat) return;
    if (!etat.actif) {
      const d = Math.hypot(ev.clientX - etat.x, ev.clientY - etat.y);
      if (etat.tactile) { if (d > 10) annuler(); return; }
      if (d > 6) activer(); else return;
    }
    ev.preventDefault();
    placerFantome(ev.clientX, ev.clientY);
    const sous = document.elementFromPoint(ev.clientX, ev.clientY);
    const cible = sous?.closest('.place[data-espace], [data-bac]') || null;
    if (cible !== etat.cible) {
      etat.cible?.classList.remove('cible');
      etat.cible = cible;
      cible?.classList.add('cible');
    }
  }

  async function lacher(ev) {
    if (!etat) return;
    const { actif, cible, id, source } = etat;
    annuler();
    if (!actif) return;
    ev.preventDefault();
    // Le clic qui suit le lâcher ne doit pas ouvrir la fiche.
    source.addEventListener('click', (c) => { c.stopPropagation(); c.preventDefault(); }, { capture: true, once: true });
    if (!cible) return;
    const vers = cible.dataset.bac
      ? { lieu: 'reserve' }
      : { lieu: 'espace', espace: cible.dataset.espace, place: Number(cible.dataset.place) };
    if (vers.lieu === 'reserve' && source.dataset.origine) return;
    try {
      await app.jeu.executer('deplacer', { oeuvre: id, vers });
    } catch (e) {
      annoncer(messageErreur(e), { erreur: true });
    }
  }

  function annuler() {
    if (!etat) return;
    clearTimeout(etat.minuterie);
    etat.fantome?.remove();
    etat.cible?.classList.remove('cible');
    etat = null;
  }

  // Sur écran tactile, seul un touchmove non passif peut empêcher le
  // défilement une fois le glisser engagé.
  const bloquer = (ev) => { if (etat?.actif) ev.preventDefault(); };
  racine.addEventListener('pointerdown', demarrer);
  window.addEventListener('pointermove', bouger, { passive: false });
  window.addEventListener('pointerup', lacher);
  window.addEventListener('pointercancel', annuler);
  window.addEventListener('touchmove', bloquer, { passive: false });
  racine.addEventListener('contextmenu', (ev) => { if (ev.target.closest('[data-oeuvre]')) ev.preventDefault(); });

  return () => {
    annuler();
    window.removeEventListener('pointermove', bouger);
    window.removeEventListener('pointerup', lacher);
    window.removeEventListener('pointercancel', annuler);
    window.removeEventListener('touchmove', bloquer);
  };
}

export { pourcent, tenter };
