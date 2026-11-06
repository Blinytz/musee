// Réglages : nom, ambiance, sessions, notifications, compte, paramètres du jeu.

import { h, icone, duree, ajouter } from '../dom.js';
import { tenter, confirmer, annoncer } from '../composants.js';
import { CONFIG } from '../../config.js';
import { abonnerPush, desabonnerPush, etatPush } from '../push.js';
import { AMBIANCES } from '../theme.js';

export async function afficher(app, vue) {
  const { jeu } = app;
  const e = jeu.etat;
  const cfg = jeu.cfg;

  const nom = h('input', { type: 'text', value: e.nom, maxlength: 60 });
  const dureeSession = h('input', { type: 'number', min: cfg.session.dureeMinMin, max: cfg.session.dureeMaxMin, step: 1, value: e.reglages.dureeSession });

  ajouter(vue, 
    app.installation ? h('button.bouton.primaire.plein.installer', { type: 'button', onclick: () => app.installer() }, 'Installer l\'application') : null,
    h('div.section', h('h2', 'Réglages')),
    h('form.carte.pile', {
      onsubmit: async (ev) => { ev.preventDefault(); await app.agir('nommer', nom.value, { succes: 'Nom enregistré' }); },
    }, h('label.champ', h('span', 'Nom du musée'), nom), h('button.bouton', { type: 'submit' }, 'Renommer')),
    h('form.carte.pile', {
      onsubmit: async (ev) => {
        ev.preventDefault();
        await app.agir('reglages', { dureeSession: Math.round(Number(dureeSession.value)) }, { succes: 'Durée enregistrée' });
      },
    }, h('label.champ', h('span', `Durée de session par défaut (${duree(e.reglages.dureeSession)})`), dureeSession), h('button.bouton', { type: 'submit' }, 'Enregistrer')),
    h('div.carte.pile',
      h('h3', 'Ambiance'),
      h('div.onglets', AMBIANCES.map(([id, nom]) => h('button', {
        type: 'button', classe: (e.reglages.ambiance || 'auto') === id ? 'actif' : '',
        onclick: () => app.agir('reglages', { ambiance: id }),
      }, id === 'jour' ? icone('jour') : id === 'nuit' ? icone('nuit') : null, nom)))),
    await notifications(app, e, cfg),
    compte(app),
    parametres(app, e),
  );
}

async function notifications(app, e, cfg) {
  const etat = await etatPush();
  const bloc = h('div.carte.pile', h('h3', 'Notifications'));
  if (etat === 'indisponible') { ajouter(bloc, h('div.tres-discret', 'Non prises en charge sur cet appareil')); return bloc; }
  if (app.demo) { ajouter(bloc, h('div.tres-discret', 'Indisponibles en démonstration')); return bloc; }
  ajouter(bloc, etat === 'abonne'
    ? h('button.bouton', { type: 'button', onclick: async () => { await tenter(() => desabonnerPush(app)); app.rafraichirVue(); } }, 'Désactiver sur cet appareil')
    : h('button.bouton.primaire', { type: 'button', onclick: async () => { await tenter(() => abonnerPush(app), { succes: 'Notifications activées' }); app.rafraichirVue(); } }, icone('notification'), 'Activer sur cet appareil'));
  for (const n of cfg.notifications) {
    const coche = h('input', {
      type: 'checkbox', checked: e.reglages.notifications?.[n.id] !== false,
      onchange: () => app.agir('reglages', { notifications: { ...e.reglages.notifications, [n.id]: coche.checked } }),
    });
    ajouter(bloc, h('label.interrupteur', h('span', n.nom), coche));
  }
  return bloc;
}

function exporter(app) {
  const donnees = JSON.stringify({ application: 'musee', exporte: new Date().toISOString(), etat: app.jeu.etat }, null, 1);
  const lien = h('a', {
    href: URL.createObjectURL(new Blob([donnees], { type: 'application/json' })),
    download: `musee-${new Date().toISOString().slice(0, 10)}.json`,
  });
  document.body.append(lien);
  lien.click();
  lien.remove();
}

function compte(app) {
  const u = app.jeu.backend.utilisateur();
  return h('div.carte.pile',
    h('h3', 'Compte'),
    h('div.discret', app.demo ? 'Démonstration' : u?.email || ''),
    h('button.bouton', { type: 'button', onclick: () => exporter(app) }, 'Exporter le musée'),
    app.demo
      ? h('div.rangee-boutons',
        h('button.bouton', { type: 'button', onclick: async () => { app.jeu.backend.avancer(3600e3); await app.jeu.rattraper(); app.rafraichirVue(); } }, '+1 h'),
        h('button.bouton', { type: 'button', onclick: async () => { app.jeu.backend.avancer(864e5); await app.jeu.rattraper(); app.rafraichirVue(); } }, '+1 jour'),
        h('button.bouton', { type: 'button', onclick: async () => { app.jeu.backend.avancer(7 * 864e5); await app.jeu.rattraper(); app.rafraichirVue(); } }, '+7 jours'))
      : null,
    app.demo
      ? h('button.bouton.danger', {
        type: 'button',
        onclick: async () => {
          if (!(await confirmer('Recommencer la démonstration ?', { oui: 'Recommencer', danger: true }))) return;
          app.jeu.backend.reinitialiser();
          localStorage.removeItem('musee_operations_v1');
          location.reload();
        },
      }, 'Recommencer')
      : h('button.bouton', {
        type: 'button',
        onclick: async () => {
          if (!(await confirmer('Se déconnecter ?', { texte: 'Toutes les applis de l\'écosystème seront déconnectées.', oui: 'Déconnexion' }))) return;
          app.jeu.backend.deconnexion();
          location.reload();
        },
      }, icone('deconnexion'), 'Déconnexion'));
}

/* ---------- Paramètres du jeu ---------- */

// Les règles de rendu et les listes de noms ne se règlent pas ici : seuls les
// nombres des règles du jeu sont proposés.
const EXCLUS = new Set(['rendu', 'themes', 'notifications', 'supports', 'temps', 'catalogue', 'push']);

const GROUPES = {
  niveaux: 'Niveaux des œuvres', depart: 'Départ', session: 'Sessions', maitrise: 'Maîtrise', visiteurs: 'Visiteurs',
  satisfaction: 'Satisfaction', reputation: 'Réputation', statuts: 'Statuts', frequentation: 'Fréquentation',
  batiment: 'Bâtiment', espaces: 'Espaces', investissements: 'Investissements', securiteRequise: 'Sécurité requise',
  campagnes: 'Campagnes', campagnesDelai: 'Campagnes', arrivages: 'Arrivages', prets: 'Prêts', expositions: 'Expositions',
  classement: 'Classement', impots: 'Impôts', personnel: 'Personnel', securite: 'Sécurité',
};

const MOTS = {
  travailH: 'travail (h)', prestige: 'prestige', maitrise: 'maîtrise requise', prix: 'prix', seuil: 'seuil annuel',
  part: 'part des recettes', niveauMax: 'niveau maximal', ateliers: 'emplacements d’atelier', ailes: 'ailes', salles: 'salles',
  reserve: 'réserve', privee: 'collection privée', reputation: 'réputation', prixBillet: 'billet', nombre: 'nombre',
  niveau: 'niveau', offertes: 'offertes', dureeMinMin: 'durée minimale (min)', dureeMaxMin: 'durée maximale (min)',
  dureeDefautMin: 'durée par défaut (min)', seuilArretMin: 'arrêt compté dès (min)', bonusDureeCoef: 'bonus de durée',
  bonusDureeRefMin: 'durée de référence (min)', heures: 'heures', bonus: 'bonus', parPrestige: 'visiteurs par prestige',
  reputationBase: 'base de réputation', reputationDiviseur: 'diviseur de réputation', depart: 'départ', jusquaUn: 'jours jusqu’à ×1',
  plateauJusqua: 'plateau jusqu’à (j)', baissePas: 'baisse par palier', baisseTousLes: 'palier (j)', plancher: 'plancher',
  reinitialisationApres: 'remise à neuf après (j)', conforme: 'conforme', nonConforme: 'non conforme', optimalBase: 'base de l’optimum',
  optimalDiviseur: 'diviseur de l’optimum', max: 'maximum', base: 'base', bonusThematique: 'bonus thématique',
  seuilCoherence: 'seuil de cohérence', densiteSeuil: 'seuil de densité', penaliteCoef: 'coefficient de pénalité',
  penaliteMax: 'pénalité maximale', vitesse: 'vitesse', bonusStatut: 'bonus de statut', bonusPret: 'bonus de prêt',
  joursMoyenne: 'jours de moyenne', joursAnnee: 'jours par an', facteur: 'facteur', sallesMax: 'salles par aile',
  places: 'places', statutMin: 'statut minimal', attrait: 'attrait', revenus: 'revenus', efficacite: 'efficacité', revele: 'révélation',
  remise: 'remise', securite: 'sécurité', coutVisiteurs: 'coût (× visiteurs)', multiplicateur: 'multiplicateur', jours: 'jours',
  jourSemaine: 'jour de la semaine', nombreConservateur: 'nombre avec conservateur', validiteJours: 'validité (j)',
  peinture: 'peinture', sculpture: 'sculpture', estampe: 'estampe', photographie: 'photographie', alerteExpirationH: 'alerte (h)',
  probabiliteHebdo: 'probabilité par semaine', ecartRangs: 'écart de rangs', durees: 'durée', remunerationHebdo: 'rémunération par semaine',
  reponseH: 'délai de réponse (h)', visiteursParPrestige: 'visiteurs par prestige', nouveauteRetour: 'nouveauté au retour',
  minOeuvres: 'œuvres minimum', maxOeuvres: 'œuvres maximum', partEmpruntsMax: 'part d’emprunts maximale', rangsAuDessus: 'rangs au-dessus',
  coutEmprunt: 'coût d’emprunt', dureeJours: 'durée (j)', coherence: 'cohérence', visiteursParPointReputation: 'visiteurs par point',
  reputationMax: 'réputation maximale', delaiJours: 'délai (j)', voisins: 'voisins affichés', agrandissement: 'agrandissement',
  aile: 'aile', salle: 'salle', nouveaute: 'nouveauté', theme: 'thème', effets: '', satisfactionEffet: 'satisfaction',
  tranches: 'tranche', taux: 'taux', grille: 'grille du statut', progression: 'progression par niveau', experience: 'expérience (h)',
  candidatsParSemaine: 'candidats par semaine', validiteCandidatsJours: 'validité des candidatures (j)',
  niveauCandidatMax: 'niveau maximal des candidats', fraisRecrutementHeures: 'frais de recrutement (h de salaire)',
  roles: '', base: 'salaire de base', poids: 'fréquence', partBase: 'part de base', partNiveau: 'part par niveau',
  plafond: 'plafond', satisfactionBase: 'satisfaction de base', satisfactionNiveau: 'satisfaction par niveau',
  plafondTotal: 'plafond total', densiteBase: 'affluence de base', densiteNiveau: 'affluence par niveau',
  remiseBase: 'remise de base', remiseNiveau: 'remise par niveau', joursTousLes: 'un jour tous les (niveaux)',
  oeuvres: 'œuvres en plus', oeuvresNiveau6: 'œuvres en plus dès le niveau 6', probabilitePret: 'probabilité de prêt',
  remunerationBase: 'rémunération de base', remunerationNiveau: 'rémunération par niveau', enqueteBase: 'enquête de base',
  enqueteNiveau: 'enquête par niveau', attraitBase: 'attrait de base', attraitNiveau: 'attrait par niveau',
  abattementBase: 'abattement de base', abattementNiveau: 'abattement par niveau', espace: 'salle', exposition: 'exposition',
  reserveForte: 'réserve en salle forte', atelier: 'atelier', probabiliteBase: 'probabilité de base',
  probabiliteMin: 'probabilité minimale', probabiliteMax: 'probabilité maximale', enquete: 'enquête par semaine',
  enqueteSemaines: 'semaines d’enquête', degats: 'dégâts au retour', protection: 'protection', securite: 'sécurité',
};

/** Liste à plat des paramètres numériques : [chemin, valeur]. */
function aPlat(objet, prefixe = []) {
  const r = [];
  for (const [k, v] of Object.entries(objet)) {
    const chemin = [...prefixe, k];
    if (typeof v === 'number') r.push([chemin, v]);
    else if (v && typeof v === 'object') r.push(...aPlat(v, chemin));
  }
  return r;
}

function lire(objet, chemin) {
  return chemin.reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), objet);
}

function ecrire(objet, chemin, valeur) {
  let o = objet;
  for (const k of chemin.slice(0, -1)) {
    if (!o[k] || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  }
  o[chemin[chemin.length - 1]] = valeur;
}

function libelle(chemin) {
  // Un indice de liste se lit par le nom de l'élément (Mineure, Café…), un
  // indice de tableau de nombres (heures de maîtrise) par son rang.
  const morceaux = [];
  for (let i = 1; i < chemin.length; i++) {
    const k = chemin[i];
    if (/^\d+$/.test(k)) {
      const liste = lire(CONFIG, chemin.slice(0, i));
      const el = liste?.[Number(k)];
      morceaux.push(el && typeof el === 'object' ? (el.nom || el.id) : `${Number(k) + 1}`);
    } else if (MOTS[k] !== '') {
      morceaux.push(MOTS[k] || k);
    }
  }
  return morceaux.join(' · ') || GROUPES[chemin[0]] || chemin[0];
}

function parametres(app, e) {
  const surcharges = JSON.parse(JSON.stringify(e.reglages.parametres || {}));
  const groupes = new Map();
  for (const [chemin, defaut] of aPlat(CONFIG)) {
    if (EXCLUS.has(chemin[0]) || chemin[chemin.length - 1] === 'id') continue;
    const g = GROUPES[chemin[0]] || chemin[0];
    if (!groupes.has(g)) groupes.set(g, []);
    groupes.get(g).push([chemin, defaut]);
  }
  const modifies = () => aPlat(surcharges).length;
  const compteur = h('span.tres-discret');
  const majCompteur = () => { compteur.textContent = modifies() ? `${modifies()} modifié${modifies() > 1 ? 's' : ''}` : ''; };
  majCompteur();

  const details = [...groupes.entries()].map(([groupe, liste]) => h('details',
    h('summary', groupe),
    liste.map(([chemin, defaut]) => {
      const actuel = lire(surcharges, chemin);
      const champ = h('input', {
        type: 'number', step: 'any', value: actuel ?? defaut,
        style: { borderColor: actuel !== undefined ? 'var(--accent)' : null },
        onchange: () => {
          const v = Number(champ.value);
          if (!Number.isFinite(v) || v === defaut) {
            ecrire(surcharges, chemin, undefined);
            champ.value = defaut;
            champ.style.borderColor = '';
          } else {
            ecrire(surcharges, chemin, v);
            champ.style.borderColor = 'var(--accent)';
          }
          majCompteur();
        },
      });
      return h('label.champ-parametre', h('span', libelle(chemin)), champ);
    })));

  return h('div.carte.parametres',
    h('div.ligne.espace', h('h3', 'Paramètres du jeu'), compteur),
    details,
    h('div.rangee-boutons', { style: { marginTop: '12px' } },
      h('button.bouton', {
        type: 'button',
        onclick: async () => {
          if (!(await confirmer('Revenir aux valeurs d\'origine ?', { oui: 'Rétablir' }))) return;
          await app.agir('reglages', { parametres: {} }, { succes: 'Valeurs d\'origine' });
        },
      }, 'Valeurs d\'origine'),
      h('button.bouton.primaire', {
        type: 'button',
        onclick: async () => {
          const propre = JSON.parse(JSON.stringify(surcharges));
          await app.agir('reglages', { parametres: propre }, { succes: 'Paramètres enregistrés' });
        },
      }, 'Enregistrer')));
}

export { annoncer };
