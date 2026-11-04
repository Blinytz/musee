// Arrivages : œuvres proposées chaque lundi, à 0 % de restauration. Elles
// arrivent en caisses, que l'on ouvre une à une.

import { h, icone, nombre, dateJour, siecleTexte, ajouter } from '../dom.js';
import { vignette, puceNiveau } from '../composants.js';
import { effets, prixArrivage, siecle } from '../../moteur/regles.js';
import { reserveLibre } from '../../moteur/batiment.js';
import { prochainJourSemaine } from '../../moteur/temps.js';

export async function afficher(app, vue) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const jour = jeu.jour();
  const revele = effets(cfg, e).revele;
  const libre = reserveLibre(e);
  const arrivages = [...e.arrivages].sort((a, b) => b.jour - a.jour);

  ajouter(vue, h('div.section', h('h2', 'Arrivages'),
    h('span.aside', { style: { color: libre <= 0 ? 'var(--rouge)' : null } }, `Réserve ${e.batiment.reserve.places - libre}/${e.batiment.reserve.places}`)));

  if (!arrivages.length) {
    const prochain = prochainJourSemaine(jour, cfg.arrivages.jourSemaine);
    ajouter(vue, h('div.vide', `Prochain arrivage le ${dateJour(prochain, { weekday: 'long', day: 'numeric', month: 'long' })}`));
    return;
  }

  const ouvertes = lireOuvertes();
  for (const a of arrivages) {
    const fiches = await app.catalogue.fiches(a.oeuvres.map((o) => o.id));
    const reste = a.expire - jour;
    const cases = a.oeuvres.map((ligne, i) => {
      const cle = `${a.id}:${ligne.id}`;
      const ouverte = () => carte(app, e, cfg, a, ligne, fiches[i], revele, libre);
      if (ligne.achetee || ouvertes.has(cle)) return ouverte();
      return caisse(cfg, ligne, fiches[i], cle, ouverte);
    });
    const fermees = cases.filter((c) => c.classList.contains('caisse'));
    ajouter(vue,
      h('div.ligne.espace', { style: { margin: '18px 2px 10px' } },
        h('h3', a.premier ? 'Premier arrivage' : `Arrivage du ${dateJour(a.jour)}`),
        h('span.tres-discret', reste <= 1 ? 'Dernier jour' : `${reste} jours`)),
      h('div.caisses', cases),
      fermees.length > 1 ? h('button.bouton.plein', {
        type: 'button', style: { marginTop: '12px' },
        onclick: (ev) => { ev.currentTarget.remove(); fermees.forEach((c, k) => setTimeout(() => c.click(), k * 120)); },
      }, 'Tout ouvrir') : null,
    );
  }
}

/* ---------- Caisses ---------- */

const CLE_CAISSES = 'musee_caisses';

function lireOuvertes() {
  try { return new Set(JSON.parse(localStorage.getItem(CLE_CAISSES) || '[]')); } catch { return new Set(); }
}

function noterOuverte(cle) {
  const liste = [...lireOuvertes(), cle].slice(-300);
  try { localStorage.setItem(CLE_CAISSES, JSON.stringify(liste)); } catch { /* stockage indisponible */ }
}

/** Caisse fermée : l'étiquette dit le niveau, le support et le siècle. */
function caisse(cfg, ligne, fiche, cle, ouverte) {
  const support = cfg.supports.find((s) => s.id === ligne.support)?.nom || ligne.support;
  const sc = siecle(fiche?.an);
  const el = h('button.caisse', {
    type: 'button',
    'aria-label': `Ouvrir la caisse · ${support}`,
    onclick: () => {
      if (el.classList.contains('ouvre')) return;
      noterOuverte(cle);
      el.classList.add('ouvre');
      setTimeout(() => {
        const contenu = ouverte();
        contenu.classList.add('deballee');
        el.replaceWith(contenu);
      }, 420);
    },
  },
  h('span.caisse-etiquette',
    h('span.fragile', 'FRAGILE'),
    puceNiveau(cfg, ligne.niveau),
    h('span', `${support} · ${sc !== null ? siecleTexte(sc) : '?'}`),
    ligne.offerte ? h('span', { style: { color: 'var(--vert)' } }, 'Offerte') : null));
  return el;
}

function carte(app, e, cfg, a, ligne, fiche, revele, libre) {
  const support = cfg.supports.find((s) => s.id === ligne.support)?.nom || ligne.support;
  const s = siecle(fiche?.an);
  const titre = revele >= 2 ? (fiche?.titre || '?') : `${support} · ${s !== null ? siecleTexte(s) : 'date inconnue'}`;
  const sous = revele >= 1
    ? [fiche?.artiste?.nom, fiche?.mouvement?.nom].filter(Boolean).join(' · ') || '?'
    : '';
  const prix = ligne.offerte ? 0 : prixArrivage(cfg, e, ligne.niveau);
  const bouton = ligne.achetee
    ? h('button.bouton.petit.plein', { type: 'button', disabled: true }, icone('valider'), 'Acquise')
    : h('button.bouton.petit.plein', {
      type: 'button',
      classe: prix === 0 ? 'primaire' : 'or',
      disabled: libre <= 0,
      onclick: async (ev) => {
        ev.stopPropagation();
        ev.currentTarget.disabled = true;
        const ok = await app.agir('acheter', { arrivage: a.id, oeuvre: ligne.id, fiche }, { succes: 'En réserve' });
        if (!ok) ev.currentTarget.disabled = false;
      },
    }, prix === 0 ? 'Offerte' : `${nombre(prix)} ✦`);
  const v = vignette(app, {
    id: ligne.id, fiche, progression: 0, niveau: ligne.niveau, support: ligne.support, titre, sous,
    onclick: () => {},
  });
  v.style.cursor = 'default';
  return h('div.pile', { style: { gap: '8px' } }, v, bouton);
}

export { puceNiveau };
