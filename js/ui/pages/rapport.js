// Rapport quotidien : la veille, la tendance, ce qui est arrivé à 4 h.

import { h, icone, nombre, grand, dateJour, ajouter } from '../dom.js';

export async function afficher(app, vue) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;
  const rapport = e.rapports[e.rapports.length - 1];
  const hist = e.historique;
  const veille = hist[hist.length - 1];
  const avantVeille = hist[hist.length - 2];

  if (rapport && !rapport.vu) jeu.executer('marquerRapportVu', null).catch(() => {});

  const delta = (a, b, format = nombre) => {
    if (a === undefined || b === undefined) return null;
    const d = a - b;
    if (Math.abs(d) < 0.05) return null;
    return h('small', { classe: d > 0 ? 'hausse' : 'baisse' }, `${d > 0 ? '+' : ''}${format(d)}`);
  };
  const evolutionRang = rapport?.rangPrecedent && rapport?.rang ? rapport.rangPrecedent - rapport.rang : 0;

  ajouter(vue, 
    h('div.section', h('h2', 'Rapport'), rapport ? h('span.aside', dateJour(rapport.jour, { weekday: 'long', day: 'numeric', month: 'long' })) : null),
    veille ? h('div.chiffres',
      h('div.chiffre', h('span', icone('visiteurs'), 'Visiteurs hier'), h('b', nombre(veille.visiteurs)), delta(veille.visiteurs, avantVeille?.visiteurs)),
      h('div.chiffre', h('span', 'Par an'), h('b', grand(veille.annualisee)), delta(veille.annualisee, avantVeille?.annualisee, grand)),
      h('div.chiffre', h('span', icone('satisfaction'), 'Satisfaction'), h('b', Math.round(veille.satisfaction)), delta(veille.satisfaction, avantVeille?.satisfaction, (x) => x.toLocaleString('fr-FR', { maximumFractionDigits: 1 }))),
      h('div.chiffre', h('span', icone('reputation'), 'Réputation'), h('b', Math.round(veille.reputation)), delta(veille.reputation, avantVeille?.reputation, (x) => x.toLocaleString('fr-FR', { maximumFractionDigits: 1 }))),
      rapport?.rang ? h('div.chiffre', h('span', icone('classement'), 'Classement'), h('b', `${rapport.rang}e`),
        evolutionRang ? h('small', { classe: evolutionRang > 0 ? 'hausse' : 'baisse' }, `${evolutionRang > 0 ? '+' : ''}${evolutionRang}`) : null) : null)
      : h('div.vide', 'Premier rapport demain à 4 h'),
    rapport?.faits?.length ? h('div.pile', { style: { marginTop: '12px' } }, rapport.faits.map((f) => fait(app, cfg, e, f))) : null,
    hist.length > 1 ? courbe(hist.slice(-30)) : null,
  );
}

function fait(app, cfg, e, f) {
  const titre = (id) => e.oeuvres[id]?.titre || '?';
  const lien = (route, ...contenu) => h('a.carte.ligne', { href: `#/${route}`, style: { textDecoration: 'none', color: 'inherit' } }, ...contenu);
  switch (f.type) {
    case 'statut': return h('div.carte', { style: { borderColor: 'var(--accent)' } }, h('h3', cfg.statuts[f.statut].nom), h('div.tres-discret', debloques(cfg, f.statut)));
    case 'classement': return h('div.carte', h('b', `${f.avant}e → ${f.rang}e`),
      f.gagnes?.length ? h('div.hausse', `Devant ${f.gagnes.join(', ')}`) : null,
      f.perdus?.length ? h('div.baisse', `Derrière ${f.perdus.join(', ')}`) : null);
    case 'arrivage': return lien('arrivages', icone('arrivages'), h('span', { style: { flex: 1 } }, `Arrivage : ${f.nombre} œuvres`), icone('droite'));
    case 'demandePret': return lien('expositions', icone('prets'), h('span', { style: { flex: 1 } }, `${f.musee} demande ${titre(f.oeuvre)}`), icone('droite'));
    case 'pretExpire': return h('div.carte.tres-discret', `Demande de ${f.musee} expirée`);
    case 'finPret': return h('div.carte', `${titre(f.oeuvre)} revient de ${f.musee}`);
    case 'candidats': return lien('personnel', icone('visiteurs'), h('span', { style: { flex: 1 } }, `${f.nombre} candidats`), icone('droite'));
    case 'cambriolage': return lien('securite', icone('alerte'), h('span', { style: { flex: 1, color: 'var(--rouge)' } }, `Cambriolage : ${f.titre}`), icone('droite'));
    case 'volSalle': return lien('securite', icone('alerte'), h('span', { style: { flex: 1, color: 'var(--rouge)' } }, `Vol en salle : ${f.titre}`), icone('droite'));
    case 'vandalisme': return lien('securite', icone('alerte'), h('span', { style: { flex: 1, color: 'var(--rouge)' } }, `Vandalisme : ${f.titre}, abîmée de ${f.degats} points`), icone('droite'));
    case 'retrouvee': return h('div.carte', `${f.titre} retrouvée, à restaurer de nouveau`);
    case 'perdue': return h('div.carte.discret', `${f.titre} : perdue`);
    case 'promotion': return h('div.carte', `${f.nom} passe niveau ${f.niveau}`);
    case 'finExposition': return h('div.carte', h('b', f.theme?.libelle || 'Exposition'), h('div.discret', `${nombre(f.visiteurs)} visiteurs · réputation +${f.bonus.toLocaleString('fr-FR')}`));
    default: return null;
  }
}

/** Annonce plein écran d'un nouveau statut : façade et déblocages. */
export function annoncerStatut(app, statut) {
  const cfg = app.jeu.cfg;
  const fermer = () => racine.remove();
  const racine = h('div.voile-fond', { style: { alignItems: 'center' }, onclick: (ev) => { if (ev.target === racine) fermer(); } },
    h('div.facade.annonce-statut', { classe: `statut-${statut}`, role: 'dialog', 'aria-label': 'Nouveau statut' },
      h('div.tres-discret', { style: { color: 'var(--creme-2)' } }, 'Nouveau statut'),
      h('div.plaque', cfg.statuts[statut].nom),
      h('div.pile', { style: { gap: '6px', margin: '14px 0 18px' } },
        debloques(cfg, statut).split(' · ').filter(Boolean).map((t) => h('div.ligne', icone('valider'), t))),
      h('button.bouton.or.plein', { type: 'button', onclick: () => { fermer(); app.naviguer('musee'); } }, 'Voir le musée')));
  document.body.append(racine);
}

/** Ce que débloque un statut (spec, section 11). */
export function debloques(cfg, s) {
  const st = cfg.statuts[s];
  const t = [];
  const avant = cfg.statuts[s - 1];
  if (!avant || st.niveauMax > avant.niveauMax) t.push(cfg.niveaux[st.niveauMax].pluriel);
  if (avant && st.ateliers > avant.ateliers) t.push(`${st.ateliers}e emplacement d'atelier`);
  if (st.prets) t.push('Prêts');
  if (st.arrivagesGraphiques) t.push('Estampes et photographies');
  for (const [, e] of Object.entries(cfg.espaces)) if (e.statutMin === s) t.push(e.nom);
  for (const i of cfg.investissements) if (i.statutMin === s) t.push(i.nom);
  for (const c of cfg.campagnes) if (c.statutMin === s) t.push(c.nom);
  return t.join(' · ');
}

function courbe(points) {
  const max = Math.max(1, ...points.map((p) => p.visiteurs));
  return h('div.carte', { style: { marginTop: '12px' } },
    h('div.ligne.espace', { style: { marginBottom: '8px' } }, h('b', 'Visiteurs'), h('span.tres-discret', `${points.length} jours`)),
    h('div.histogramme', points.map((p) => h('i', { style: { height: `${(p.visiteurs / max) * 100}%` }, title: `${dateJour(p.jour)} : ${nombre(p.visiteurs)}` }))));
}
