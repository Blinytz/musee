// Fiche d'œuvre : image, cartel, emplacement, image personnalisée, inspection.

import { h, icone, nombre, pourcent, duree, siecleTexte, ajouter, majuscule } from '../dom.js';
import { peindre, puceNiveau, jauge, tenter, sourceImage, confirmer, feuille, cartel } from '../composants.js';
import { urlSecours } from '../../rendu/images.js';
import { prestige, nouveaute, siecle, niveau } from '../../moteur/regles.js';
import { detailVisiteurs } from '../../moteur/visiteurs.js';
import { espacesPublics, contenuEspace, refusAccrochage } from '../../moteur/batiment.js';
import { etape } from '../../rendu/restauration.js';
import { zoomMax } from '../../rendu/images.js';

export async function afficher(app, vue, { params }) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const id = Number(params[0]);
  const o = e.oeuvres[id];
  const fiche = await app.fiche(id);
  if (!o && !fiche) { ajouter(vue, h('div.vide', 'Œuvre introuvable')); return; }

  const progression = o ? o.progression : 1;
  const toile = h('div.oeuvre-toile', { style: { minHeight: '200px', cursor: progression >= 1 ? 'zoom-in' : 'default' } });
  peindre(app, toile, { fiche, oeuvre: o, progression, id, support: o?.support || fiche?.support, cote: 1000 });
  if (progression >= 1) toile.addEventListener('click', () => inspecter(app, fiche, o));

  const support = cfg.supports.find((s) => s.id === (o?.support || fiche?.support));
  const n = o?.niveau ?? fiche?.niveau ?? 0;
  const an = o?.an ?? fiche?.an;
  const s = siecle(an);
  const ligneInfo = (libelle, valeur) => (valeur ? h('div.ligne.espace', { style: { gap: '16px' } }, h('span.discret', libelle), h('span', { style: { textAlign: 'right' } }, valeur)) : null);
  const c = cartel(app, o, fiche);
  // Tant que l'œuvre n'est pas restaurée, le cartel reste partiel.
  const wiki = c.connu ? fiche?.wiki : null;

  ajouter(vue, 
    h('div.ligne', { style: { margin: '6px 0 10px' } },
      h('button.bouton.icone-seule', { type: 'button', 'aria-label': 'Retour', onclick: () => app.retour() }, icone('gauche')),
      h('div', { style: { flex: 1 } }),
      progression >= 1 ? h('button.bouton.petit', { type: 'button', onclick: () => inspecter(app, fiche, o) }, icone('zoom'), 'Inspecter') : null),
    toile,
    h('div', { style: { margin: '14px 2px 4px' } },
      h('h1', c.titre),
      c.connu && fiche?.titreEn ? h('div.tres-discret', { style: { fontStyle: 'italic' } }, fiche.titreEn) : null,
      h('div.discret', { style: { marginTop: '4px' } }, [c.artiste, c.connu ? (fiche?.date || (an ?? '')) : null].filter(Boolean).join(', '))),
    h('div.ligne', { style: { flexWrap: 'wrap', gap: '6px', margin: '10px 0' } },
      puceNiveau(cfg, n),
      h('span.puce', icone('prestige'), `${prestige(cfg, n)}`),
      support ? h('span.puce', support.nom) : null,
      s !== null ? h('span.puce', siecleTexte(s)) : null),
    h('div.carte.pile', { style: { gap: '8px' } },
      ligneInfo('Mouvement', c.mouvement),
      ligneInfo('Pays', c.connu ? majuscule(fiche?.pays?.nom || o?.pays?.nom) : null),
      ligneInfo('Conservation', c.connu ? majuscule(fiche?.collection?.nom) : null),
      ligneInfo('Dimensions', fiche?.dim ? `${fiche.dim.map((x) => x.toLocaleString('fr-FR')).join(' × ')} cm` : null),
      ligneInfo('Notoriété', c.connu && fiche?.vues ? `${nombre(fiche.vues)} vues par an` : null),
      ligneInfo('Image', fiche?.image ? `${nombre(fiche.image.w)} × ${nombre(fiche.image.h)} px` : null),
      wiki ? h('div.ligne', { style: { gap: '12px' } },
        wiki.fr ? h('a', { href: `https://fr.wikipedia.org/wiki/${encodeURIComponent(wiki.fr)}`, target: '_blank', rel: 'noopener' }, 'Wikipédia') : null,
        wiki.en ? h('a', { href: `https://en.wikipedia.org/wiki/${encodeURIComponent(wiki.en)}`, target: '_blank', rel: 'noopener' }, 'Wikipedia (en)') : null) : null),
    o ? etatOeuvre(app, e, cfg, o) : null,
  );
}

function lieuTexte(e, cfg, o) {
  switch (o.lieu) {
    case 'espace': {
      const sp = espacesPublics(e).find((x) => x.id === o.espace);
      return sp?.nom || cfg.espaces[sp?.type]?.nom || o.espace;
    }
    case 'reserve': return 'Réserve';
    case 'privee': return 'Collection privée';
    case 'atelier': return 'Atelier';
    case 'pret': return 'Prêtée';
    case 'exposition': return 'Exposition temporaire';
    default: return o.lieu;
  }
}

function etatOeuvre(app, e, cfg, o) {
  const jour = app.jeu.jour();
  const fini = o.progression >= 1;
  const apport = detailVisiteurs(cfg, e, jour).parOeuvre.find((a) => a.id === o.id);
  const pret = o.lieu === 'pret' ? e.prets.enCours.find((p) => p.oeuvre === o.id) : null;
  const deplacer = (vers) => app.agir('deplacer', { oeuvre: o.id, vers });
  const premierePlace = () => {
    for (const sp of espacesPublics(e)) {
      if (refusAccrochage(cfg, e, o, sp.id)) continue;
      const i = contenuEspace(e, sp.id).indexOf(null);
      if (i >= 0) return { lieu: 'espace', espace: sp.id, place: i };
    }
    return null;
  };
  const boutons = [];
  if (!['pret', 'exposition'].includes(o.lieu) && e.session?.oeuvre !== o.id) {
    if (!fini && o.lieu !== 'atelier') boutons.push(h('button.bouton', { type: 'button', onclick: () => deplacer({ lieu: 'atelier' }) }, 'Atelier'));
    if (fini && o.lieu !== 'espace') {
      const place = premierePlace();
      boutons.push(h('button.bouton.primaire', { type: 'button', disabled: !place, title: place ? '' : refusAccrochage(cfg, e, o, 's1') || 'Aucune place', onclick: () => deplacer(place) }, 'Salle'));
    }
    if (fini && o.lieu !== 'privee') boutons.push(h('button.bouton', { type: 'button', onclick: () => deplacer({ lieu: 'privee' }) }, 'Privée'));
    if (o.lieu !== 'reserve') boutons.push(h('button.bouton', { type: 'button', onclick: () => deplacer({ lieu: 'reserve' }) }, 'Réserve'));
  }

  return h('div.pile', { style: { marginTop: '12px' } },
    h('div.carte.pile', { style: { gap: '8px' } },
      h('div.ligne.espace', h('b', lieuTexte(e, cfg, o)),
        pret ? h('span.tres-discret', `${pret.museeNom} · retour dans ${pret.fin - jour} j`) : null),
      h('div.ligne.espace', h('span.discret', fini ? 'Restaurée' : etape(cfg.rendu, o.progression).nom), h('b.nombre', pourcent(o.progression, 1))),
      fini ? null : jauge(o.progression),
      o.minutes ? h('div.ligne.espace', h('span.discret', 'Sessions'), h('span', duree(o.minutes))) : null,
      fini && (o.lieu === 'espace' || o.lieu === 'exposition')
        ? h('div.ligne.espace', h('span.discret', 'Nouveauté'), h('span', `×${nouveaute(cfg, o.joursExpo).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`)) : null,
      apport ? h('div.ligne.espace', h('span.discret', 'Visiteurs par jour'), h('span', nombre(apport.visiteurs))) : null,
      !fini ? h('div.ligne.espace', h('span.discret', 'Maîtrise requise'), h('span', `${niveau(cfg, o.niveau).maitrise}`)) : null),
    boutons.length ? h('div.rangee-boutons', boutons) : null,
    imagePerso(app, o));
}

function imagePerso(app, o) {
  const champ = h('input', {
    type: 'file', accept: 'image/*', hidden: true,
    onchange: async () => {
      const f = champ.files?.[0];
      if (!f) return;
      if (f.size > 8e6) { (await import('../composants.js')).annoncer('Image trop lourde (8 Mo maximum)', { erreur: true }); return; }
      await tenter(async () => {
        const chemin = await app.jeu.backend.envoyerImage(o.id, f);
        const ancien = o.imagePerso;
        await app.jeu.executer('imagePerso', { oeuvre: o.id, chemin });
        if (ancien) app.jeu.backend.supprimerImage(ancien);
      }, { succes: 'Image remplacée' });
    },
  });
  return h('div.rangee-boutons',
    champ,
    h('button.bouton', { type: 'button', onclick: () => champ.click() }, icone('telecharger'), 'Autre image'),
    o.imagePerso ? h('button.bouton', {
      type: 'button',
      onclick: async () => {
        if (!(await confirmer('Revenir à l\'image par défaut ?', { oui: 'Revenir' }))) return;
        const ancien = o.imagePerso;
        const ok = await app.agir('imagePerso', { oeuvre: o.id, chemin: null });
        if (ok && ancien) app.jeu.backend.supprimerImage(ancien);
      },
    }, icone('retour'), 'Image par défaut') : null);
}

/* ---------- Inspection ---------- */

/**
 * Zoom libre sur l'œuvre restaurée, en pleine définition. Le zoom maximal
 * s'arrête quand un pixel de l'image source occupe un pixel de l'écran.
 */
async function inspecter(app, fiche, o) {
  const im = fiche?.image;
  const cote = Math.max(im?.w || 0, im?.h || 0) || 4000;
  const url = await sourceImage(app, fiche, o, Math.min(cote, 6000));
  const img = h('img', { src: url, alt: fiche?.titre || '', referrerpolicy: 'no-referrer', draggable: false });
  const secours = o?.imagePerso ? null : urlSecours(fiche, Math.min(cote, 6000));
  if (secours) img.addEventListener('error', () => { if (img.src !== secours) img.src = secours; }, { once: true });
  const niveauZoom = h('div.zoom');
  const racine = h('div#inspection', img,
    h('button.bouton.icone-seule.fermer', { type: 'button', 'aria-label': 'Fermer', onclick: () => fermer() }, icone('fermer')),
    niveauZoom);
  ajouter(document.body, racine);
  const echap = (ev) => { if (ev.key === 'Escape') fermer(); };
  document.addEventListener('keydown', echap);
  function fermer() { racine.remove(); document.removeEventListener('keydown', echap); }

  await img.decode().catch(() => {});
  const W = racine.clientWidth;
  const H = racine.clientHeight;
  const nw = img.naturalWidth || 1;
  const nh = img.naturalHeight || 1;
  const base = Math.min(W / nw, H / nh);
  // Largeur source connue par le catalogue si l'image chargée est réduite.
  const sourceW = o?.imagePerso ? nw : (im?.w || nw);
  const densite = devicePixelRatio || 1;
  const max = Math.max(1, zoomMax({ image: { w: sourceW } }, nw * base, densite));
  let echelle = 1;
  let x = (W - nw * base) / 2;
  let y = (H - nh * base) / 2;

  function appliquer() {
    const largeur = nw * base * echelle;
    const hauteur = nh * base * echelle;
    x = largeur <= W ? (W - largeur) / 2 : Math.min(0, Math.max(W - largeur, x));
    y = hauteur <= H ? (H - hauteur) / 2 : Math.min(0, Math.max(H - hauteur, y));
    img.style.width = `${nw * base}px`;
    img.style.transform = `translate(${x}px, ${y}px) scale(${echelle})`;
    niveauZoom.textContent = `×${echelle.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}${echelle >= max - 0.01 ? ' · max' : ''}`;
  }
  function zoomer(facteur, cx, cy) {
    const nouvelle = Math.min(max, Math.max(1, echelle * facteur));
    const k = nouvelle / echelle;
    x = cx - (cx - x) * k;
    y = cy - (cy - y) * k;
    echelle = nouvelle;
    appliquer();
  }
  appliquer();

  racine.addEventListener('wheel', (ev) => { ev.preventDefault(); zoomer(ev.deltaY < 0 ? 1.15 : 1 / 1.15, ev.clientX, ev.clientY); }, { passive: false });
  racine.addEventListener('dblclick', (ev) => zoomer(echelle < max / 2 ? 2.5 : 1 / echelle, ev.clientX, ev.clientY));
  const pointeurs = new Map();
  let ecart = 0;
  racine.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('button')) return;
    racine.setPointerCapture(ev.pointerId);
    pointeurs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointeurs.size === 2) {
      const [a, b] = [...pointeurs.values()];
      ecart = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  racine.addEventListener('pointermove', (ev) => {
    const p = pointeurs.get(ev.pointerId);
    if (!p) return;
    if (pointeurs.size === 1) {
      x += ev.clientX - p.x;
      y += ev.clientY - p.y;
      appliquer();
    }
    pointeurs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointeurs.size === 2) {
      const [a, b] = [...pointeurs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (ecart) zoomer(d / ecart, (a.x + b.x) / 2, (a.y + b.y) / 2);
      ecart = d;
    }
  });
  const lever = (ev) => { pointeurs.delete(ev.pointerId); if (pointeurs.size < 2) ecart = 0; };
  racine.addEventListener('pointerup', lever);
  racine.addEventListener('pointercancel', lever);
}

export { feuille };
