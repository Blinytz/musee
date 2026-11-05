// Paramètres du jeu. Aucune valeur de règle ne doit vivre ailleurs : les
// moteurs reçoivent toujours la configuration effective (ces valeurs,
// recouvertes par les réglages du joueur, voir `configEffective`).
//
// Le même fichier est importé par l'application, la simulation Node,
// l'Edge Function quotidienne et le pipeline du catalogue.

export const CONFIG = {
  temps: {
    fuseau: 'Europe/Paris',
    // Le jour de jeu commence à 4 h : une session à 1 h du matin compte
    // encore pour la veille.
    heureDebutJour: 4,
  },

  // Prix d'arrivage = arrondi(50 × prestige^1,3), arrondi « commercial » tel
  // que fixé par le tableau de référence (209 devient 210, 2 456 devient 2 450).
  niveaux: [
    { id: 0, nom: 'Mineure', pluriel: 'Mineures', travailH: 2, prestige: 1, maitrise: 1, prix: 50 },
    { id: 1, nom: 'Notable', pluriel: 'Notables', travailH: 5, prestige: 3, maitrise: 2, prix: 210 },
    { id: 2, nom: 'Remarquable', pluriel: 'Remarquables', travailH: 12, prestige: 8, maitrise: 4, prix: 750 },
    { id: 3, nom: 'Majeure', pluriel: 'Majeures', travailH: 30, prestige: 20, maitrise: 6, prix: 2450 },
    { id: 4, nom: 'Chef-d\'œuvre', pluriel: 'Chefs-d\'œuvre', travailH: 60, prestige: 50, maitrise: 8, prix: 8000 },
    { id: 5, nom: 'Trésor', pluriel: 'Trésors', travailH: 120, prestige: 150, maitrise: 10, prix: 34000 },
  ],

  catalogue: {
    // Bornes hautes des percentiles de pages vues, du plus prestigieux au
    // moins prestigieux, calculées sur les seules œuvres ayant une page.
    percentiles: { 5: 0.005, 4: 0.02, 3: 0.06, 2: 0.15, 1: 0.35 },
    partArtisteSansPage: 0.01,
    tranche: 1000,
    url: './catalogue/',
  },

  supports: [
    { id: 'peinture', nom: 'Peinture', pluriel: 'Peintures' },
    { id: 'sculpture', nom: 'Sculpture', pluriel: 'Sculptures' },
    { id: 'photographie', nom: 'Photographie', pluriel: 'Photographies' },
    { id: 'estampe', nom: 'Estampe', pluriel: 'Estampes' },
  ],

  depart: {
    ailes: 1,
    salles: 2,
    reserve: 10,
    privee: 3,
    reputation: 50,
    prixBillet: 1,
    premierArrivage: { nombre: 5, niveau: 0, offertes: 1 },
    // Le musée ouvre avec un gardien : sans lui, aucune salle n'ouvrirait.
    personnel: [{ role: 'gardien', niveau: 1 }],
  },

  session: {
    dureeMinMin: 10,
    dureeMaxMin: 420,
    dureeDefautMin: 60,
    // Un arrêt anticipé ne compte qu'au-delà de ce temps écoulé.
    seuilArretMin: 10,
    // Travail effectif = durée × (1 + coef × durée / référence) × (1 + bonus).
    bonusDureeCoef: 0.25,
    bonusDureeRefMin: 420,
  },

  maitrise: {
    heures: [0, 5, 15, 35, 70, 120, 200, 300, 450, 650],
    bonus: [0, 0.03, 0.06, 0.09, 0.12, 0.15, 0.18, 0.21, 0.24, 0.27],
  },

  visiteurs: {
    parPrestige: 10,
    reputationBase: 0.5,
    reputationDiviseur: 100,
    nouveaute: {
      depart: 2,
      jusquaUn: 30,
      plateauJusqua: 180,
      baissePas: 0.05,
      baisseTousLes: 30,
      plancher: 0.7,
      // Une œuvre absente des salles au moins ce nombre de jours repart de ×2.
      reinitialisationApres: 30,
    },
    theme: { conforme: 1.25, nonConforme: 0.8 },
    // Facteur prix = exp(-(prix - 1) / optimal), optimal = base + réputation / diviseur.
    prix: { optimalBase: 1, optimalDiviseur: 20, max: 50 },
  },

  satisfaction: {
    base: 60,
    bonusThematique: 10,
    seuilCoherence: 0.8,
    densiteSeuil: 150,
    penaliteCoef: 20,
    penaliteMax: 40,
  },

  reputation: {
    depart: 50,
    vitesse: 0.05,
    max: 100,
    bonusStatut: 5,
    bonusPret: 1,
  },

  // Charges de fin de session (docs/ECONOMIE.md, section 1). Le billet est
  // encaissé en entier ; chaque dépense est retirée en clair, par heure de
  // session, figée au lancement comme les recettes. Rien ne se paie hors
  // session.
  charges: {
    // Coût d'un visiteur (ménage, énergie, billetterie), selon le statut.
    accueil: [0.6, 0.65, 0.7, 0.72, 0.74, 0.76],
    // Entretien : par espace public et par aile, × grille du statut.
    entretien: { espace: 5, aile: 5, grille: [0.4, 2, 5, 15, 20, 20] },
    // Assurance : part de la valeur exposée par heure, majorée selon le
    // risque de la semaine ; un vol est remboursé à hauteur de `indemnite`.
    assurance: { taux: 0.0012, risque: 10, indemnite: 0.5 },
    // Fournitures par heure, selon le niveau de l'œuvre restaurée.
    fournitures: [0, 2, 8, 30, 100, 300],
  },

  // Usure des œuvres exposées (docs/ECONOMIE.md, section 4) : `parJour` par
  // jour de visite (la moitié en près de trois mois), `effet` sur l'attrait
  // à usure complète. Au-delà de `maxExposable`, l'œuvre ne s'accroche plus.
  // Le vandalisme ajoute de `vandalisme[0]` à `vandalisme[1]` d'usure ; une
  // œuvre retrouvée revient usée au moins de `retrouvee`.
  usure: { parJour: 0.005, effet: 0.4, aReparer: 0.4, maxExposable: 0.8, vandalisme: [0.4, 0.8], retrouvee: 0.6 },

  // Travaux d'atelier menés par les restaurateurs (les assistants), en vrai
  // temps. Jours = charge du niveau × ampleur / vitesse, ampleur = `ravivage`
  // + `parUsure` × usure pour une réparation. Vitesse = base + niveau × pas,
  // × efficacité. Une œuvre restée `reposPriveeJours` en collection privée
  // retrouve tout son attrait de nouveauté.
  atelier: {
    joursBase: [1, 1, 1.5, 2, 2.5, 3], ravivage: 0.5, parUsure: 1.5, seuilReparation: 0.1,
    vitesseBase: 0.8, vitesseNiveau: 0.1, reposPriveeJours: 15,
    // Attrait de nouveauté d'une œuvre ravivée (atelier ou repos) : moins
    // que celui d'une nouvelle acquisition ou d'un retour de prêt.
    nouveaute: 1.4,
  },

  // La cote du musée : plus il est connu, plus les vendeurs demandent cher.
  cote: [1, 1, 1, 1.3, 1.8, 2.5],

  // Chantiers : un agrandissement payé sort de terre pendant les sessions,
  // en heures de session ; tant qu'un chantier dure, le musée accueille
  // `malus` de ses visiteurs.
  chantiers: { heures: { salle: 4, aile: 10, agrandissement: 2, espace: 6 }, malus: 0.9 },

  // `niveauMax` : plus haut niveau d'œuvre proposé dans les arrivages.
  statuts: [
    { id: 0, nom: 'Galerie de quartier', seuil: 0, niveauMax: 1, ateliers: 1 },
    { id: 1, nom: 'Musée municipal', seuil: 20000, niveauMax: 2, ateliers: 2 },
    { id: 2, nom: 'Musée régional', seuil: 150000, niveauMax: 2, ateliers: 2, prets: true, arrivagesGraphiques: true },
    { id: 3, nom: 'Musée national', seuil: 1000000, niveauMax: 3, ateliers: 3, expositions: true },
    { id: 4, nom: 'Musée international', seuil: 3000000, niveauMax: 4, ateliers: 3 },
    { id: 5, nom: 'Musée universel', seuil: 6000000, niveauMax: 5, ateliers: 4 },
  ],
  frequentation: { joursMoyenne: 7, joursAnnee: 365 },

  batiment: {
    aile: { prix: 5000, facteur: 2.5, max: 6, sallesMax: 4 },
    // Prix d'une salle = prix × facteur^n, n = salles déjà achetées (les
    // salles de départ sont offertes et ne comptent pas).
    salle: { prix: 500, facteur: 1.35, places: 6 },
    agrandissement: { places: 3, max: 15, prix: [400, 1200, 3600] },
    reserve: { places: 10, prix: 200, facteur: 2 },
    privee: { places: 3, prix: 300, facteur: 2 },
    // Emplacements d'atelier en plus de ceux du statut.
    atelier: { prix: 2000, facteur: 3, max: 4 },
  },

  // Espaces publics particuliers. `supports` : ce qu'on peut y accrocher.
  espaces: {
    salle: { supports: ['peinture', 'sculpture'] },
    cabinet: { nom: 'Cabinet d\'arts graphiques', prix: 8000, statutMin: 2, places: 8, supports: ['estampe', 'photographie'], agrandissable: true },
    jardin: { nom: 'Jardin de sculptures', prix: 20000, statutMin: 3, places: 8, supports: ['sculpture'], attrait: 1.2 },
    exposition: { nom: 'Salle d\'exposition temporaire', prix: 30000, statutMin: 3, places: 15 },
  },

  // Investissements à paiement unique et effet permanent.
  // Effets : `revenus` (multiplicatif), `satisfaction` (additif), `efficacite`
  // (bonus de travail additif), `revele` (0 rien, 1 mouvement et artiste,
  // 2 titre), `remise` (remise totale sur les arrivages), `securite` (niveau
  // d'exposition autorisé), `salleForte`, protections par menace.
  investissements: [
    { id: 'cafe', categorie: 'equipements', nom: 'Café', prix: 2000, effets: { revenus: 1.1, satisfaction: 3 } },
    { id: 'boutique', categorie: 'equipements', nom: 'Boutique', prix: 5000, statutMin: 2, effets: { revenus: 1.2 } },
    { id: 'audioguides', categorie: 'equipements', nom: 'Audioguides', prix: 10000, statutMin: 2, effets: { satisfaction: 10 } },
    { id: 'loupe', categorie: 'atelier', nom: 'Loupe binoculaire', prix: 1000, effets: { efficacite: 0.05 } },
    { id: 'climatisation', categorie: 'atelier', nom: 'Salle climatisée', prix: 10000, effets: { efficacite: 0.05 } },
    { id: 'imagerie', categorie: 'atelier', nom: 'Laboratoire d\'imagerie', prix: 50000, effets: { efficacite: 0.10 } },
    { id: 'bibliotheque', categorie: 'documentation', nom: 'Bibliothèque', prix: 3000, effets: { revele: 1, remise: 0.10 } },
    { id: 'archives', categorie: 'documentation', nom: 'Archives', prix: 25000, prerequis: 'bibliotheque', effets: { revele: 2, remise: 0.20 } },
    // Matériel de sécurité commun à tout le musée (docs/ECONOMIE.md, section
    // 3) : les portiques de l'entrée, le poste central, le chenil, les
    // drones. Le reste s'installe salle par salle (`materielSalle`).
    // `requiert` : métier sans lequel le matériel ne donne que la part `sans`.
    { id: 'portiques', categorie: 'securite', nom: 'Portiques de détection', prix: 6000, statutMin: 2, effets: { vandalisme: 15, electronique: true } },
    { id: 'chenil', categorie: 'securite', nom: 'Chenil', prix: 10000, statutMin: 3, effets: {} },
    { id: 'pcSecurite', categorie: 'securite', nom: 'Poste central de sécurité', prix: 30000, statutMin: 3, effets: {} },
    { id: 'drones', categorie: 'securite', nom: 'Drones de surveillance', prix: 60000, statutMin: 4, effets: { vol: 40, electronique: true, requiert: 'pilote', sans: 0 } },
  ],
  // Niveau de sécurité requis pour exposer un niveau d'œuvre.
  securiteRequise: { 4: 1, 5: 2 },

  campagnes: [
    { id: 'affichage', nom: 'Campagne d\'affichage', coutVisiteurs: 3, multiplicateur: 1.5, jours: 7 },
    { id: 'presse', nom: 'Partenariat presse', coutVisiteurs: 5, multiplicateur: 2, jours: 3, statutMin: 3 },
  ],
  // Jours entre la fin d'une campagne et le début de la suivante.
  campagnesDelai: 30,

  arrivages: {
    jourSemaine: 1, // lundi
    nombre: 5,
    validiteJours: 7,
    supports: { peinture: 0.60, sculpture: 0.15, estampe: 0.15, photographie: 0.10 },
    // Avant le statut régional, seuls ces supports sont proposés.
    supportsDeBase: ['peinture', 'sculpture'],
    alerteExpirationH: 24,
  },

  prets: {
    statutMin: 2,
    probabiliteHebdo: 0.5,
    ecartRangs: 10,
    durees: [7, 14, 21],
    remunerationHebdo: 0.30,
    reponseH: 48,
    visiteursParPrestige: 15,
    nouveauteRetour: 1.5,
  },

  expositions: {
    statutMin: 3,
    minOeuvres: 6,
    maxOeuvres: 15,
    partEmpruntsMax: 0.5,
    rangsAuDessus: 30,
    coutEmprunt: 0.5,
    dureeJours: 21,
    attrait: 2,
    coherence: 1.5,
    visiteursParPointReputation: 10000,
    reputationMax: 15,
    delaiJours: 30,
  },

  classement: { voisins: 3 },

  // Impôt sur le bénéfice d'une session, barème progressif appliqué au
  // bénéfice horaire. `jusqua` : borne haute de la tranche (✦ par heure).
  impots: {
    tranches: [
      { jusqua: 100, taux: 0 },
      { jusqua: 1000, taux: 0.20 },
      { jusqua: 4000, taux: 0.40 },
      { jusqua: null, taux: 0.55 },
    ],
  },

  // Personnel (docs/ECONOMIE.md, section 2). Salaire horaire = base ×
  // progression^(niveau - 1) × grille[statut].
  personnel: {
    grille: [1, 2, 4, 10, 18, 25],
    progression: 1.15,
    niveauMax: 10,
    // Heures de session travaillées pour atteindre les niveaux 2 à 10.
    experience: [10, 30, 70, 140, 250, 400, 600, 850, 1150],
    candidatsParSemaine: 6,
    validiteCandidatsJours: 7,
    // Niveau maximal d'un candidat selon le statut du musée.
    niveauCandidatMax: [2, 3, 4, 6, 8, 10],
    fraisRecrutementHeures: 10,
    // Au-delà de ce retard (en heures de salaires et d'entretien), on ne recrute plus.
    arrieresToleresHeures: 10,
    // Deux personnes de même niveau ne se valent pas. Efficacité tirée en
    // cloche entre min et max (moyenne 1), appliquée à tout ce qu'apporte la
    // personne ; prétention salariale qui suit l'efficacité pour `suit`, plus
    // un écart propre à chacun : il y a des affaires et des salaires trop
    // élevés. Moyennes de 1 : l'équilibrage d'ensemble ne bouge pas.
    profil: { efficaciteMin: 0.75, efficaciteMax: 1.25, suit: 0.6, ecart: 0.3, salaireMin: 0.75, salaireMax: 1.3 },
    roles: [
      // Sécurité. `menaces` : protection par niveau, partagée entre les salles
      // que l'agent couvre ; `equipement` : matériel sans lequel le métier
      // n'existe pas (global, ou installé dans au moins une salle).
      { id: 'gardien', nom: 'Gardien de salle', pluriel: 'Gardiens de salle', famille: 'securite', statutMin: 0, base: 0.5, poids: 4, menaces: { vol: 4 } },
      { id: 'veilleur', nom: 'Veilleur de nuit', pluriel: 'Veilleurs de nuit', famille: 'securite', statutMin: 1, base: 0.5, poids: 2, menaces: { vol: 6 } },
      { id: 'surete', nom: 'Agent de sûreté', pluriel: 'Agents de sûreté', famille: 'securite', statutMin: 2, equipement: 'portiques', base: 0.5, poids: 2, menaces: { vol: 2, vandalisme: 8 } },
      { id: 'operateur', nom: 'Opérateur vidéo', pluriel: 'Opérateurs vidéo', famille: 'securite', statutMin: 2, equipement: 'cameras', base: 0.6, poids: 2, menaces: { vol: 8 } },
      { id: 'maitreChien', nom: 'Maître-chien', pluriel: 'Maîtres-chiens', famille: 'securite', statutMin: 3, equipement: 'chenil', base: 0.7, poids: 1, menaces: { vol: 12 } },
      { id: 'technicien', nom: 'Technicien de sécurité', pluriel: 'Techniciens de sécurité', famille: 'securite', statutMin: 1, equipement: 'alarme', base: 0.8, poids: 1, unique: true, materielBase: 0.10, materielNiveau: 0.03 },
      { id: 'chefSecurite', nom: 'Chef de la sécurité', pluriel: 'Chefs de la sécurité', famille: 'securite', statutMin: 3, equipement: 'pcSecurite', base: 1.2, poids: 1, unique: true, humainBase: 0.10, humainNiveau: 0.03 },
      { id: 'pilote', nom: 'Pilote de drone', pluriel: 'Pilotes de drone', famille: 'securite', statutMin: 4, equipement: 'drones', base: 1, poids: 1, menaces: { vol: 25 } },
      { id: 'assistant', nom: 'Assistant restaurateur', pluriel: 'Assistants restaurateurs', statutMin: 1, base: 1, poids: 2, partBase: 0.12, partNiveau: 0.03, plafond: 0.30 },
      { id: 'mediateur', nom: 'Médiateur', pluriel: 'Médiateurs', statutMin: 0, base: 0.6, poids: 2, satisfactionBase: 1.5, satisfactionNiveau: 0.5, plafondTotal: 15 },
      { id: 'accueil', nom: 'Agent d\'accueil', pluriel: 'Agents d\'accueil', statutMin: 0, base: 0.5, poids: 2, densiteBase: 0.06, densiteNiveau: 0.02 },
      { id: 'communication', nom: 'Chargé de communication', pluriel: 'Chargés de communication', statutMin: 1, base: 1, poids: 1, unique: true, remiseBase: 0.10, remiseNiveau: 0.04, joursTousLes: 3 },
      { id: 'conservateur', nom: 'Conservateur', pluriel: 'Conservateurs', statutMin: 2, base: 1.5, poids: 1, unique: true, oeuvres: 1, oeuvresNiveau6: 2 },
      { id: 'regisseur', nom: 'Régisseur des œuvres', pluriel: 'Régisseurs des œuvres', statutMin: 2, base: 1, poids: 1, unique: true, probabilitePret: 0.15, remunerationBase: 0.10, remunerationNiveau: 0.03, enqueteBase: 0.02, enqueteNiveau: 0.01 },
      { id: 'commissaire', nom: 'Commissaire d\'exposition', pluriel: 'Commissaires d\'exposition', statutMin: 3, base: 1.5, poids: 1, unique: true, attraitBase: 0.10, attraitNiveau: 0.03, remiseBase: 0.10, remiseNiveau: 0.03 },
      { id: 'comptable', nom: 'Comptable', pluriel: 'Comptables', statutMin: 3, base: 1.2, poids: 1, unique: true, abattementBase: 0.05, abattementNiveau: 0.02 },
    ],
  },

  // Sécurité (docs/ECONOMIE.md, section 3), salle par salle. Chaque jour, à
  // une heure tirée au hasard, chaque espace subit un tirage de vol et un de
  // vandalisme : probabilité par jour = base × risque / (protection +
  // plancher), bornée entre min et max. Le risque vient des œuvres de
  // l'espace, la protection de son matériel et des agents qui le couvrent.
  // Un incident coûte `reputation` points tout de suite et `confiance`
  // points durables (retirés des bonus permanents).
  securite: {
    jourSemaine: 0, // l'enquête de la police, chaque dimanche
    menaces: {
      vol: { nom: 'Vol', base: 0.0035, plancher: 4, min: 0.0002, max: 0.05, reputation: 3, confiance: 1 },
      vandalisme: { nom: 'Vandalisme', base: 0.003, plancher: 15, min: 0, max: 0.03, reputation: 2, confiance: 0.5, exposant: 1.5, diviseur: 10 },
    },
    // Affluence : une salle bondée cache mieux un voleur (0,5 + densité / ref, plafonnée).
    affluence: { densiteRef: 100, max: 3 },
    // Poids d'une œuvre dans le risque de vol selon son emplacement.
    poids: { espace: 1, exposition: 1, privee: 0, reserve: 0.6, reserveBlindee: 0.2, atelier: 0.5 },
    // Ce qui se glisse sous un manteau part plus facilement.
    portabilite: { estampe: 2, photographie: 2, peinture: 1, sculpture: 0.5 },
    // Un agent couvre au plus ce nombre de salles ; sa protection s'y partage.
    sallesParAgent: 3,
    enquete: 0.07,
    enqueteSemaines: 26,
    // Risque maximal (par semaine, vol et vandalisme de la salle la plus
    // exposée) qu'un prêteur accepte selon le niveau de l'œuvre empruntée.
    seuilsEmprunt: { 3: 0.05, 4: 0.03, 5: 0.015 },
  },

  // Détectives (docs/ECONOMIE.md, section 3) : engagés par mission, payés
  // d'avance à la semaine, `prime` du prix de l'œuvre à celui qui la ramène.
  // Chance par semaine = (base + niveau × pas) × efficacité. Tarif par
  // semaine = base × facteur^(niveau - 1) × grille du statut × prétention.
  // Niveau : œuvres retrouvées (seuils `xp`).
  detectives: {
    candidatsParSemaine: 3, tarifBase: 15, tarifNiveau: 1.25, chanceBase: 0.05, chanceNiveau: 0.015,
    xp: [1, 3, 6, 10, 15, 21, 28, 36, 45], durees: [2, 4, 8], prime: 0.05,
    piste: {
      probabilite: 0.15, prixPart: 0.6, joursReponse: 3, bonusPolice: 0.15,
      villes: ['Genève', 'Anvers', 'Londres', 'Bruxelles', 'Marseille', 'Amsterdam', 'Milan', 'New York', 'Hong Kong', 'Vienne'],
    },
  },

  // Matériel installé dans un espace précis. Son prix suit la taille de la
  // salle (× places / 6). `vol`, `vandalisme` : protection de cet espace ;
  // `electronique` : renforcé par le technicien ; `requiert` : agent affecté
  // à la salle sans lequel il ne donne que `sans` ; `norme` : niveau de
  // sécurité exigé pour accrocher Chefs-d'œuvre (1) et Trésors (2) ;
  // `blindage` : la réserve n'attire presque plus les cambrioleurs ;
  // `lieux` : espaces où il s'installe (salles publiques par défaut).
  materielSalle: [
    { id: 'porte', nom: 'Porte blindée', prix: 300, statutMin: 0, vol: 5, lieux: ['public', 'reserve', 'atelier'] },
    { id: 'alarme', nom: 'Alarme', prix: 1500, statutMin: 1, vol: 15, electronique: true, lieux: ['public', 'reserve', 'atelier'] },
    { id: 'cameras', nom: 'Caméras', prix: 4000, statutMin: 2, vol: 20, vandalisme: 15, electronique: true, requiert: 'operateur', sans: 0.5, lieux: ['public', 'reserve', 'atelier'] },
    { id: 'vitrines', nom: 'Vitrines sécurisées', prix: 8000, statutMin: 3, vol: 40, vandalisme: 60, lieux: ['public'] },
    { id: 'blindage', nom: 'Blindage', prix: 12000, statutMin: 2, blindage: true, lieux: ['reserve'] },
    { id: 'norme1', nom: 'Sécurité niveau 1', prix: 20000, statutMin: 4, norme: 1, vol: 60, vandalisme: 30, lieux: ['public'] },
    { id: 'norme2', nom: 'Sécurité niveau 2', prix: 60000, statutMin: 5, prerequis: 'norme1', norme: 2, vol: 150, vandalisme: 100, lieux: ['public'] },
  ],


  // Clé publique VAPID des notifications, la même que WikiDeck (publiée dans
  // son js/notifications.js) : les secrets d'Edge Function sont communs à tout
  // le projet Supabase, la clé privée y est déjà (VAPID_PRIVATE).
  push: { clePublique: 'BDP0es16rH6pFdoCwUi3Qmy4n3EMWGSeFci5mMinNSipPNZuKeRR--vLf4D9PTrkdesZZ8bzGxui5-nYCRIiTIc' },

  notifications: [
    { id: 'session', nom: 'Fin de session' },
    { id: 'arrivage', nom: 'Nouvel arrivage' },
    { id: 'expiration', nom: 'Arrivage qui expire' },
    { id: 'pret', nom: 'Demande de prêt' },
    { id: 'classement', nom: 'Classement' },
    { id: 'statut', nom: 'Nouveau statut' },
    { id: 'exposition', nom: 'Fin d\'exposition' },
    { id: 'cambriolage', nom: 'Vols, vandalisme et enquêtes' },
    { id: 'personnel', nom: 'Personnel' },
  ],

  // Rendu de la restauration (section 5). Chaque paramètre est une suite de
  // points [progression, valeur] interpolés ; `blocs` l'est géométriquement.
  rendu: {
    etapes: [
      { fin: 0.10, nom: 'Consolidation' },
      { fin: 0.30, nom: 'Nettoyage' },
      { fin: 0.55, nom: 'Dévernissage' },
      { fin: 0.80, nom: 'Réintégration' },
      { fin: 1.00, nom: 'Vernis' },
    ],
    // Intensité de chaque couche selon la progression, de 1 (pleine) à 0.
    // Chaque étape efface la sienne : refixer les écailles, ôter la crasse
    // (et le voile qu'elle laisse, si `voileEtape` le dit), alléger le
    // vernis, combler les lacunes, puis la retouche finale.
    flou: [[0, 1], [0.10, 1], [0.30, 0.55], [0.55, 0.18], [0.80, 0.06], [1, 0]],
    vernis: [[0, 1], [0.30, 1], [0.55, 0]],
    crasse: [[0, 1], [0.10, 1], [0.30, 0]],
    lacunes: [[0, 0.06], [0.55, 0.06], [0.80, 0]],
    bordLacunes: [[0, 1], [0.10, 0.2]],
    craquelures: [[0, 0.75], [0.10, 0.6], [0.80, 0.45], [1, 0]],
    grain: [[0, 1], [0.80, 0.6], [1, 0]],
    supports: {
      peinture: {
        flou: 7, desature: 0.55, teinte: '#f2b861', teinteForce: 0.8, voile: '#4d3519', voileForce: 0.42, voileEtape: 'crasse',
        crasse: '#21140a', crasseForce: 0.42, taches: 0.6, tachesFrequence: 8,
        craquelures: '#22160b', craqueluresForce: 0.75, cellules: 26, deformation: 0.35, epaisseur: 1.1,
        fond: '#cdbd9c', bordLacune: '#2a190b', bords: 0.1, grainLacunes: 30, regroupement: 0.5, anneau: 0.5, grain: 0.35,
      },
      sculpture: {
        flou: 5, desature: 0.6, teinte: '#d9cdb8', teinteForce: 0.5, voile: '#bdb4a5', voileForce: 0.3,
        crasse: '#141210', crasseForce: 0.6, taches: 0.3, tachesFrequence: 10,
        craquelures: '#1d1a17', craqueluresForce: 0.5, cellules: 7, deformation: 0.45, epaisseur: 1.4,
        fond: '#d8d0c2', bordLacune: '#3a342c', bords: 0.45, grainLacunes: 9, anneau: 0.4, grain: 0.4,
      },
      photographie: {
        flou: 4, desature: 0.8, teinte: '#e8c58f', teinteForce: 0.7, voile: '#cfd8e2', voileMode: 'screen', voileForce: 0.6, voileBords: true,
        crasse: '#5a3d22', crasseForce: 0.35, taches: 1, tachesFrequence: 30,
        craquelures: '#f4f0e6', craqueluresForce: 0.35, cellules: 9, deformation: 0.5, epaisseur: 0.9,
        fond: '#f1ece1', bordLacune: '#8a7a62', bords: 0.55, grainLacunes: 10, anneau: 0.3, grain: 0.5,
      },
      estampe: {
        flou: 4, desature: 0.5, teinte: '#e6c27e', teinteForce: 0.8, voile: '#a87a3c', voileForce: 0.18,
        crasse: '#6b4420', crasseForce: 0.4, taches: 1, tachesFrequence: 26,
        craquelures: '#9b8466', craqueluresForce: 0.3, cellules: 4, deformation: 0.2, epaisseur: 1,
        fond: '#efe5cc', bordLacune: '#9d8a68', bords: 0.65, grainLacunes: 8, anneau: 0.35, grain: 0.3,
      },
    },
  },

  themes: [
    { id: 'mouvement', nom: 'Mouvement' },
    { id: 'artiste', nom: 'Artiste' },
    { id: 'pays', nom: 'Pays' },
    { id: 'siecle', nom: 'Siècle' },
    { id: 'support', nom: 'Support' },
  ],
};

/** Configuration effective : les valeurs par défaut recouvertes par les réglages. */
export function configEffective(surcharges) {
  return fusionner(CONFIG, surcharges || {});
}

function fusionner(base, sur) {
  if (Array.isArray(base)) {
    if (!sur || typeof sur !== 'object') return base;
    // Les tableaux se recouvrent élément par élément, la surcharge pouvant
    // être un objet indexé ({ "2": { "prix": 900 } }) : changer un prix ne
    // doit pas effacer le reste du niveau.
    return base.map((v, i) => (Object.hasOwn(sur, i) ? fusionner(v, sur[i]) : v));
  }
  if (base && typeof base === 'object') {
    if (!sur || typeof sur !== 'object') return base;
    const r = { ...base };
    for (const [k, v] of Object.entries(sur)) r[k] = k in base ? fusionner(base[k], v) : v;
    return r;
  }
  return sur === undefined || sur === null ? base : sur;
}
