// Historique : sessions et mouvements d'Éclats.

import { h, vider, nombre, duree, pourcent, ajouter } from '../dom.js';
import { cartel } from '../composants.js';

export async function afficher(app, vue) {
  const e = app.jeu.etat;
  let onglet = sessionStorage.getItem('musee_historique') || 'sessions';
  const onglets = h('div.onglets');
  const corps = h('div.pile', { style: { marginTop: '12px', gap: '6px' } });
  const quand = (ms) => new Date(ms).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function dessiner() {
    try { sessionStorage.setItem('musee_historique', onglet); } catch { /* navigation privée */ }
    vider(onglets, ...[['sessions', 'Sessions'], ['eclats', 'Éclats']].map(([id, nom]) => h('button', {
      type: 'button', classe: onglet === id ? 'actif' : '', onclick: () => { onglet = id; dessiner(); },
    }, nom)));
    if (onglet === 'sessions') {
      const liste = [...e.sessions].reverse();
      const total = e.sessions.reduce((s, x) => s + x.minutes, 0);
      vider(corps, 
        h('div.ligne.espace.tres-discret', h('span', `${nombre(e.sessions.length)} sessions`), h('span', duree(total))),
        ...liste.map((s) => h('a.carte.pile', {
          href: `#/oeuvre/${s.oeuvre}`, style: { gap: '4px', textDecoration: 'none', color: 'inherit' },
        },
        h('div.ligne.espace', h('b', e.oeuvres[s.oeuvre] ? cartel(app, e.oeuvres[s.oeuvre], null).titre : s.titre), h('span.eclats', nombre(s.eclats))),
        h('div.ligne.espace.tres-discret',
          h('span', `${quand(s.debut)} · ${duree(s.minutes)} · travail ${duree(s.travail)}`),
          h('span', `${pourcent(s.avant)} → ${pourcent(s.apres)}${s.verse ? '' : ' · à verser'}`)),
        s.recettes !== undefined ? h('div.tres-discret', `Recettes ${nombre(s.recettes)} · salaires ${nombre(s.salaires)} · impôts ${nombre(s.impot)}`) : null)),
        liste.length ? null : h('div.vide', 'Aucune session'));
    } else {
      const liste = [...(e.eclats || [])].reverse();
      vider(corps, 
        ...liste.map((m) => h('div.carte.ligne.espace',
          h('div', { style: { minWidth: 0 } }, h('div', m.motif), h('div.tres-discret', m.verse ? '' : 'En attente')),
          h('b.nombre', { classe: m.montant > 0 ? 'hausse' : '' }, `${m.montant > 0 ? '+' : ''}${nombre(m.montant)} ✦`))),
        liste.length ? null : h('div.vide', 'Aucun mouvement'));
    }
  }
  ajouter(vue, h('div.section', h('h2', 'Historique')), onglets, corps);
  dessiner();
}
