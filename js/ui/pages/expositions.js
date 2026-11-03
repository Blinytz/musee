// Expositions temporaires et prêts.

import { h, vider, icone, nombre, dateJour, siecleTexte, ajouter, majuscule } from '../dom.js';
import { feuille, vignette, confirmer, tenter, puceNiveau } from '../composants.js';
import { etatExpositions, museesPreteurs, coutEmprunt } from '../../moteur/actions.js';
import { debloque } from '../../moteur/arrivages.js';
import { estConforme, siecle } from '../../moteur/regles.js';
import { uuid } from '../../moteur/alea.js';
import { peutEmprunter } from '../../moteur/securite.js';
import { valeursTheme } from './musee.js';

export async function afficher(app, vue) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  ajouter(vue, h('div.section', h('h2', 'Prêts')), await prets(app, e, cfg));
  ajouter(vue, h('div.section', h('h2', 'Expositions')), await expositions(app, e, cfg));
}

/* ---------- Prêts ---------- */

async function prets(app, e, cfg) {
  const jour = app.jeu.jour();
  if (!debloque(cfg, e, 'prets')) return h('div.carte.tres-discret', cfg.statuts[cfg.prets.statutMin].nom);
  const bloc = h('div.pile');
  const d = e.prets.demande;
  if (d) {
    const fiche = await app.fiche(d.oeuvre);
    const o = e.oeuvres[d.oeuvre];
    ajouter(bloc, h('div.carte.pile', { style: { borderColor: 'var(--accent)' } },
      h('div.ligne', { style: { alignItems: 'flex-start' } },
        h('div', { style: { width: '84px', flex: 'none' } }, vignette(app, { id: d.oeuvre, fiche, oeuvre: o, titre: '', onclick: () => app.naviguer(`oeuvre/${d.oeuvre}`) })),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('h3', majuscule(d.museeNom)),
          h('div.discret', o?.titre),
          h('div.tres-discret', `${d.duree} jours · expire ${d.expire - jour <= 1 ? 'demain' : `dans ${d.expire - jour} jours`}`),
          h('div.eclats', { style: { marginTop: '6px' } }, nombre(d.remuneration)))),
      h('div.rangee-boutons',
        h('button.bouton', { type: 'button', onclick: () => app.agir('refuserPret', null) }, 'Refuser'),
        h('button.bouton.primaire', {
          type: 'button',
          onclick: async () => {
            if (!(await confirmer(`Prêter à ${majuscule(d.museeNom)} ?`, { texte: `${d.duree} jours · ${nombre(d.remuneration)} ✦`, oui: 'Prêter' }))) return;
            await app.agir('accepterPret', null, { succes: 'Prêt accordé' });
          },
        }, 'Accepter'))));
  }
  for (const p of e.prets.enCours) {
    ajouter(bloc, h('a.carte.ligne.espace', { href: `#/oeuvre/${p.oeuvre}`, style: { textDecoration: 'none', color: 'inherit' } },
      h('div', h('b', e.oeuvres[p.oeuvre]?.titre || '?'), h('div.tres-discret', majuscule(p.museeNom))),
      h('span.puce', `Retour le ${dateJour(p.fin)}`)));
  }
  if (!d && !e.prets.enCours.length) ajouter(bloc, h('div.carte.tres-discret', 'Aucune demande'));
  return bloc;
}

/* ---------- Expositions ---------- */

async function expositions(app, e, cfg) {
  const jour = app.jeu.jour();
  const st = etatExpositions(cfg, e, jour);
  const bloc = h('div.pile');
  if (!debloque(cfg, e, 'expositions')) {
    ajouter(bloc, h('div.carte.tres-discret', cfg.statuts[cfg.expositions.statutMin].nom));
    return bloc;
  }
  if (!e.batiment.exposition) {
    ajouter(bloc, h('a.carte.ligne.espace', { href: '#/investir', style: { textDecoration: 'none', color: 'inherit' } },
      h('span', cfg.espaces.exposition.nom), h('span.puce', `${nombre(cfg.espaces.exposition.prix)} ✦`)));
    return bloc;
  }
  const x = st.courante;
  if (x) {
    const fiches = await app.catalogue.fiches([...x.oeuvres, ...x.emprunts.map((m) => m.id)]);
    ajouter(bloc, h('div.carte.pile',
      h('div.ligne.espace', h('h3', x.theme.libelle), h('span.puce', `${x.fin - jour} j`)),
      h('div.ligne.espace', h('span.discret', 'Visiteurs'), h('b.nombre', nombre(x.visiteurs))),
      h('div.ligne.espace', h('span.discret', 'Réputation attendue'), h('b.nombre', `+${Math.min(cfg.expositions.reputationMax, x.visiteurs / cfg.expositions.visiteursParPointReputation).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}`)),
      h('div.grille', [...x.oeuvres.map((id, i) => vignette(app, { id, fiche: fiches[i], oeuvre: e.oeuvres[id], onclick: () => app.naviguer(`oeuvre/${id}`) })),
        ...x.emprunts.map((m, i) => vignette(app, { id: m.id, fiche: fiches[x.oeuvres.length + i], progression: 1, niveau: m.niveau, sous: 'Emprunt', onclick: () => {} }))])));
  } else {
    ajouter(bloc, h('button.bouton.primaire.plein', {
      type: 'button', disabled: !!st.disponibleLe,
      onclick: () => composer(app),
    }, st.disponibleLe ? `Nouvelle exposition le ${dateJour(st.disponibleLe)}` : 'Nouvelle exposition'));
  }
  for (const ancienne of [...e.expositions.historique].reverse()) {
    ajouter(bloc, h('div.carte.ligne.espace',
      h('div', h('b', ancienne.theme.libelle), h('div.tres-discret', `${dateJour(ancienne.debut)} · ${ancienne.oeuvres + ancienne.emprunts} œuvres`)),
      h('div', { style: { textAlign: 'right' } }, h('div.nombre', nombre(ancienne.visiteurs)), h('div.tres-discret', `+${ancienne.bonus.toLocaleString('fr-FR')}`))));
  }
  return bloc;
}

/** Composition d'une exposition : thème, œuvres du joueur, emprunts. */
async function composer(app) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const X = cfg.expositions;
  let theme = null;
  const choisies = new Set();
  const emprunts = new Map();
  const corps = h('div.pile');
  const pied = h('div.pile', { style: { marginTop: '12px' } });
  const f = feuille({ titre: 'Nouvelle exposition', contenu: corps, actions: pied });

  function etapeTheme() {
    let type = 'mouvement';
    const onglets = h('div.onglets');
    const liste = h('div.pile');
    const dessiner = () => {
      vider(onglets, ...cfg.themes.map((t) => h('button', { type: 'button', classe: t.id === type ? 'actif' : '', onclick: () => { type = t.id; dessiner(); } }, t.nom)));
      const valeurs = valeursTheme(cfg, restaurees(), type);
      vider(liste, ...valeurs.map((v) => h('button.carte.ligne.espace', {
        type: 'button', style: { width: '100%' },
        onclick: () => { theme = { type, valeur: v.valeur, libelle: v.libelle }; etapeOeuvres(); },
      }, h('span', v.libelle), h('span.tres-discret', v.n))), valeurs.length ? '' : h('div.vide', 'Aucune œuvre restaurée'));
    };
    dessiner();
    vider(corps, onglets, liste);
    vider(pied, );
  }

  function restaurees() {
    const oeuvres = {};
    for (const o of Object.values(e.oeuvres)) if (o.progression >= 1 && ['espace', 'reserve', 'privee'].includes(o.lieu)) oeuvres[o.id] = o;
    return { ...e, oeuvres };
  }

  async function etapeOeuvres() {
    const conformes = Object.values(restaurees().oeuvres).filter((o) => estConforme(o, theme));
    const fiches = await app.catalogue.fiches(conformes.map((o) => o.id));
    const grille = h('div.grille', conformes.map((o, i) => {
      const v = vignette(app, {
        id: o.id, fiche: fiches[i], oeuvre: o,
        coin: choisies.has(o.id) ? h('span.puce', { style: { background: 'var(--accent)', color: '#1c0b19' } }, icone('valider')) : null,
        onclick: () => {
          if (choisies.has(o.id)) choisies.delete(o.id);
          else if (choisies.size + emprunts.size < X.maxOeuvres) choisies.add(o.id);
          etapeOeuvres();
        },
      });
      return v;
    }));
    vider(corps, h('div.ligne.espace', h('h3', theme.libelle), h('button.bouton.petit', { type: 'button', onclick: etapeTheme }, 'Thème')), grille);
    resume(() => etapeEmprunts());
  }

  async function etapeEmprunts() {
    vider(corps, h('div.vide', 'Recherche dans les musées voisins…'));
    const preteurs = museesPreteurs(cfg, e, jeu.musees);
    const nomMusee = new Map(jeu.musees.map((m) => [m.id, m.nom]));
    const candidats = [];
    for (const mid of preteurs) {
      const lignes = await app.catalogue.oeuvresDuMusee(mid);
      for (const [id, support, niveau, an, artiste, mouvement, pays] of lignes) {
        if (e.oeuvres[id]) continue;
        const o = { id, support, niveau, an, artiste: artiste ? { q: artiste } : null, mouvement: mouvement ? { q: mouvement } : null, pays: pays ? { q: pays } : null };
        if (estConforme(o, theme)) candidats.push({ ...o, musee: mid });
      }
    }
    candidats.sort((a, b) => b.niveau - a.niveau);
    const visibles = candidats.slice(0, 60);
    const fiches = await app.catalogue.fiches(visibles.map((c) => c.id));
    const max = Math.floor((choisies.size + emprunts.size) * X.partEmpruntsMax);
    vider(corps, 
      h('div.ligne.espace', h('h3', 'Emprunts'), h('span.tres-discret', `${preteurs.length} musées`)),
      visibles.length ? h('div.grille', visibles.map((c, i) => {
        const fiche = fiches[i];
        const refuse = !peutEmprunter(cfg, e, c.niveau, jeu.jour());
        return vignette(app, {
          id: c.id, fiche, progression: 1, niveau: c.niveau,
          sous: refuse ? 'Sécurité insuffisante' : `${nomMusee.get(c.musee) || ''} · ${nombre(coutEmprunt(cfg, c.niveau, e))} ✦`,
          coin: emprunts.has(c.id) ? h('span.puce', { style: { background: 'var(--accent)', color: '#1c0b19' } }, icone('valider')) : null,
          onclick: () => {
            if (refuse) { app.naviguer('securite'); f.fermer(); return; }
            if (emprunts.has(c.id)) emprunts.delete(c.id);
            else if (choisies.size + emprunts.size < X.maxOeuvres && emprunts.size + 1 <= Math.floor((choisies.size + emprunts.size + 1) * X.partEmpruntsMax)) {
              emprunts.set(c.id, { ...c, ...fiche, id: c.id, niveau: c.niveau, support: c.support, an: c.an, musee: c.musee,
                artiste: fiche?.artiste || c.artiste, mouvement: fiche?.mouvement || c.mouvement, pays: fiche?.pays || c.pays });
            }
            etapeEmprunts();
          },
        });
      })) : h('div.vide', 'Aucune œuvre conforme chez les musées voisins'),
      max >= 0 ? null : null);
    resume(null, etapeOeuvres);
  }

  function resume(suivant, precedent) {
    const total = choisies.size + emprunts.size;
    const cout = [...emprunts.values()].reduce((s, m) => s + coutEmprunt(cfg, m.niveau, e), 0);
    const valide = total >= X.minOeuvres && total <= X.maxOeuvres && emprunts.size <= Math.floor(total * X.partEmpruntsMax);
    vider(pied, 
      h('div.ligne.espace', h('span.discret', `${choisies.size} + ${emprunts.size} emprunts`), h('b', `${total}/${X.maxOeuvres}`)),
      h('div.rangee-boutons',
        precedent ? h('button.bouton', { type: 'button', onclick: precedent }, 'Retour') : null,
        suivant ? h('button.bouton', { type: 'button', onclick: suivant }, 'Emprunts') : null,
        h('button.bouton.primaire', {
          type: 'button', disabled: !valide,
          onclick: async () => {
            const ok = await tenter(() => jeu.executer('ouvrirExposition', {
              id: uuid(), theme, oeuvres: [...choisies], emprunts: [...emprunts.values()],
            }), { succes: 'Exposition ouverte' });
            if (ok) { f.fermer(); app.rafraichirSolde(); }
          },
        }, cout ? `Ouvrir · ${nombre(cout)} ✦` : 'Ouvrir')));
  }

  etapeTheme();
}

export { siecle, siecleTexte, puceNiveau };
