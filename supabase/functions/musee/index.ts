// @ts-nocheck
// Fichier produit par outils/fonction.mjs à partir de supabase/source/musee.js
// et des moteurs js/moteur : ne pas modifier à la main.
// js/config.js
var CONFIG = {
  temps: {
    fuseau: "Europe/Paris",
    // Le jour de jeu commence à 4 h : une session à 1 h du matin compte
    // encore pour la veille.
    heureDebutJour: 4
  },
  // Prix d'arrivage = arrondi(50 × prestige^1,3), arrondi « commercial » tel
  // que fixé par le tableau de référence (209 devient 210, 2 456 devient 2 450).
  niveaux: [
    { id: 0, nom: "Mineure", pluriel: "Mineures", travailH: 2, prestige: 1, maitrise: 1, prix: 50 },
    { id: 1, nom: "Notable", pluriel: "Notables", travailH: 5, prestige: 3, maitrise: 2, prix: 210 },
    { id: 2, nom: "Remarquable", pluriel: "Remarquables", travailH: 12, prestige: 8, maitrise: 4, prix: 750 },
    { id: 3, nom: "Majeure", pluriel: "Majeures", travailH: 30, prestige: 20, maitrise: 6, prix: 2450 },
    { id: 4, nom: "Chef-d'\u0153uvre", pluriel: "Chefs-d'\u0153uvre", travailH: 60, prestige: 50, maitrise: 8, prix: 8e3 },
    { id: 5, nom: "Tr\xE9sor", pluriel: "Tr\xE9sors", travailH: 120, prestige: 150, maitrise: 10, prix: 34e3 }
  ],
  catalogue: {
    // Bornes hautes des percentiles de pages vues, du plus prestigieux au
    // moins prestigieux, calculées sur les seules œuvres ayant une page.
    percentiles: { 5: 5e-3, 4: 0.02, 3: 0.06, 2: 0.15, 1: 0.35 },
    partArtisteSansPage: 0.01,
    tranche: 1e3,
    url: "./catalogue/"
  },
  supports: [
    { id: "peinture", nom: "Peinture", pluriel: "Peintures" },
    { id: "sculpture", nom: "Sculpture", pluriel: "Sculptures" },
    { id: "photographie", nom: "Photographie", pluriel: "Photographies" },
    { id: "estampe", nom: "Estampe", pluriel: "Estampes" }
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
    personnel: [{ role: "gardien", niveau: 1 }]
  },
  session: {
    dureeMinMin: 10,
    dureeMaxMin: 420,
    dureeDefautMin: 60,
    // Un arrêt anticipé ne compte qu'au-delà de ce temps écoulé.
    seuilArretMin: 10,
    // Travail effectif = durée × (1 + coef × durée / référence) × (1 + bonus).
    bonusDureeCoef: 0.25,
    bonusDureeRefMin: 420
  },
  maitrise: {
    heures: [0, 5, 15, 35, 70, 120, 200, 300, 450, 650],
    bonus: [0, 0.03, 0.06, 0.09, 0.12, 0.15, 0.18, 0.21, 0.24, 0.27]
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
      reinitialisationApres: 30
    },
    theme: { conforme: 1.25, nonConforme: 0.8 },
    // Facteur prix = exp(-(prix - 1) / optimal), optimal = base + réputation / diviseur.
    prix: { optimalBase: 1, optimalDiviseur: 20, max: 50 }
  },
  satisfaction: {
    base: 60,
    bonusThematique: 10,
    seuilCoherence: 0.8,
    densiteSeuil: 150,
    penaliteCoef: 20,
    penaliteMax: 40
  },
  reputation: {
    depart: 50,
    vitesse: 0.05,
    max: 100,
    bonusStatut: 5,
    bonusPret: 1
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
    assurance: { taux: 12e-4, risque: 10, indemnite: 0.5 },
    // Fournitures par heure, selon le niveau de l'œuvre restaurée.
    fournitures: [0, 2, 8, 30, 100, 300]
  },
  // Usure des œuvres exposées (docs/ECONOMIE.md, section 4) : `parJour` par
  // jour de visite (la moitié en près de trois mois), `effet` sur l'attrait
  // à usure complète. Au-delà de `maxExposable`, l'œuvre ne s'accroche plus.
  // Le vandalisme ajoute de `vandalisme[0]` à `vandalisme[1]` d'usure ; une
  // œuvre retrouvée revient usée au moins de `retrouvee`.
  usure: { parJour: 5e-3, effet: 0.4, aReparer: 0.4, maxExposable: 0.8, vandalisme: [0.4, 0.8], retrouvee: 0.6 },
  // Travaux d'atelier menés par les restaurateurs (les assistants), en vrai
  // temps. Jours = charge du niveau × ampleur / vitesse, ampleur = `ravivage`
  // + `parUsure` × usure pour une réparation. Vitesse = base + niveau × pas,
  // × efficacité. Une œuvre restée `reposPriveeJours` en collection privée
  // retrouve tout son attrait de nouveauté.
  atelier: {
    joursBase: [1, 1, 1.5, 2, 2.5, 3],
    ravivage: 0.5,
    parUsure: 1.5,
    seuilReparation: 0.1,
    vitesseBase: 0.8,
    vitesseNiveau: 0.1,
    reposPriveeJours: 15,
    // Attrait de nouveauté d'une œuvre ravivée (atelier ou repos) : moins
    // que celui d'une nouvelle acquisition ou d'un retour de prêt.
    nouveaute: 1.4
  },
  // La cote du musée : plus il est connu, plus les vendeurs demandent cher.
  cote: [1, 1, 1, 1.3, 1.8, 2.5],
  // Chantiers : un agrandissement payé sort de terre pendant les sessions,
  // en heures de session ; tant qu'un chantier dure, le musée accueille
  // `malus` de ses visiteurs.
  chantiers: { heures: { salle: 4, aile: 10, agrandissement: 2, espace: 6 }, malus: 0.9 },
  // `niveauMax` : plus haut niveau d'œuvre proposé dans les arrivages.
  statuts: [
    { id: 0, nom: "Galerie de quartier", seuil: 0, niveauMax: 1, ateliers: 1 },
    { id: 1, nom: "Mus\xE9e municipal", seuil: 2e4, niveauMax: 2, ateliers: 2 },
    { id: 2, nom: "Mus\xE9e r\xE9gional", seuil: 15e4, niveauMax: 2, ateliers: 2, prets: true, arrivagesGraphiques: true },
    { id: 3, nom: "Mus\xE9e national", seuil: 1e6, niveauMax: 3, ateliers: 3, expositions: true },
    { id: 4, nom: "Mus\xE9e international", seuil: 3e6, niveauMax: 4, ateliers: 3 },
    { id: 5, nom: "Mus\xE9e universel", seuil: 6e6, niveauMax: 5, ateliers: 4 }
  ],
  frequentation: { joursMoyenne: 7, joursAnnee: 365 },
  batiment: {
    aile: { prix: 5e3, facteur: 2.5, max: 6, sallesMax: 4 },
    // Prix d'une salle = prix × facteur^n, n = salles déjà achetées (les
    // salles de départ sont offertes et ne comptent pas).
    salle: { prix: 500, facteur: 1.35, places: 6 },
    agrandissement: { places: 3, max: 15, prix: [400, 1200, 3600] },
    reserve: { places: 10, prix: 200, facteur: 2 },
    privee: { places: 3, prix: 300, facteur: 2 },
    // Emplacements d'atelier en plus de ceux du statut.
    atelier: { prix: 2e3, facteur: 3, max: 4 }
  },
  // Espaces publics particuliers. `supports` : ce qu'on peut y accrocher.
  espaces: {
    salle: { supports: ["peinture", "sculpture"] },
    cabinet: { nom: "Cabinet d'arts graphiques", prix: 8e3, statutMin: 2, places: 8, supports: ["estampe", "photographie"], agrandissable: true },
    jardin: { nom: "Jardin de sculptures", prix: 2e4, statutMin: 3, places: 8, supports: ["sculpture"], attrait: 1.2 },
    exposition: { nom: "Salle d'exposition temporaire", prix: 3e4, statutMin: 3, places: 15 }
  },
  // Investissements à paiement unique et effet permanent.
  // Effets : `revenus` (multiplicatif), `satisfaction` (additif), `efficacite`
  // (bonus de travail additif), `revele` (0 rien, 1 mouvement et artiste,
  // 2 titre), `remise` (remise totale sur les arrivages), `securite` (niveau
  // d'exposition autorisé), `salleForte`, protections par menace.
  investissements: [
    { id: "cafe", categorie: "equipements", nom: "Caf\xE9", prix: 2e3, effets: { revenus: 1.1, satisfaction: 3 } },
    { id: "boutique", categorie: "equipements", nom: "Boutique", prix: 5e3, statutMin: 2, effets: { revenus: 1.2 } },
    { id: "audioguides", categorie: "equipements", nom: "Audioguides", prix: 1e4, statutMin: 2, effets: { satisfaction: 10 } },
    { id: "loupe", categorie: "atelier", nom: "Loupe binoculaire", prix: 1e3, effets: { efficacite: 0.05 } },
    { id: "climatisation", categorie: "atelier", nom: "Salle climatis\xE9e", prix: 1e4, effets: { efficacite: 0.05 } },
    { id: "imagerie", categorie: "atelier", nom: "Laboratoire d'imagerie", prix: 5e4, effets: { efficacite: 0.1 } },
    { id: "bibliotheque", categorie: "documentation", nom: "Biblioth\xE8que", prix: 3e3, effets: { revele: 1, remise: 0.1 } },
    { id: "archives", categorie: "documentation", nom: "Archives", prix: 25e3, prerequis: "bibliotheque", effets: { revele: 2, remise: 0.2 } },
    // Matériel de sécurité commun à tout le musée (docs/ECONOMIE.md, section
    // 3) : les portiques de l'entrée, le poste central, le chenil, les
    // drones. Le reste s'installe salle par salle (`materielSalle`).
    // `requiert` : métier sans lequel le matériel ne donne que la part `sans`.
    { id: "portiques", categorie: "securite", nom: "Portiques de d\xE9tection", prix: 6e3, statutMin: 2, effets: { vandalisme: 15, electronique: true } },
    { id: "chenil", categorie: "securite", nom: "Chenil", prix: 1e4, statutMin: 3, effets: {} },
    { id: "pcSecurite", categorie: "securite", nom: "Poste central de s\xE9curit\xE9", prix: 3e4, statutMin: 3, effets: {} },
    { id: "drones", categorie: "securite", nom: "Drones de surveillance", prix: 6e4, statutMin: 4, effets: { vol: 40, electronique: true, requiert: "pilote", sans: 0 } }
  ],
  // Niveau de sécurité requis pour exposer un niveau d'œuvre.
  securiteRequise: { 4: 1, 5: 2 },
  campagnes: [
    { id: "affichage", nom: "Campagne d'affichage", coutVisiteurs: 3, multiplicateur: 1.5, jours: 7 },
    { id: "presse", nom: "Partenariat presse", coutVisiteurs: 5, multiplicateur: 2, jours: 3, statutMin: 3 }
  ],
  // Jours entre la fin d'une campagne et le début de la suivante.
  campagnesDelai: 30,
  arrivages: {
    jourSemaine: 1,
    // lundi
    nombre: 5,
    validiteJours: 7,
    supports: { peinture: 0.6, sculpture: 0.15, estampe: 0.15, photographie: 0.1 },
    // Avant le statut régional, seuls ces supports sont proposés.
    supportsDeBase: ["peinture", "sculpture"],
    alerteExpirationH: 24
  },
  prets: {
    statutMin: 2,
    probabiliteHebdo: 0.5,
    ecartRangs: 10,
    durees: [7, 14, 21],
    remunerationHebdo: 0.3,
    reponseH: 48,
    visiteursParPrestige: 15,
    nouveauteRetour: 1.5
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
    visiteursParPointReputation: 1e4,
    reputationMax: 15,
    delaiJours: 30
  },
  classement: { voisins: 3 },
  // Impôt sur le bénéfice d'une session, barème progressif appliqué au
  // bénéfice horaire. `jusqua` : borne haute de la tranche (✦ par heure).
  impots: {
    tranches: [
      { jusqua: 100, taux: 0 },
      { jusqua: 1e3, taux: 0.2 },
      { jusqua: 4e3, taux: 0.4 },
      { jusqua: null, taux: 0.55 }
    ]
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
      { id: "gardien", nom: "Gardien de salle", pluriel: "Gardiens de salle", famille: "securite", statutMin: 0, base: 0.5, poids: 4, menaces: { vol: 4 } },
      { id: "veilleur", nom: "Veilleur de nuit", pluriel: "Veilleurs de nuit", famille: "securite", statutMin: 1, base: 0.5, poids: 2, menaces: { vol: 6 } },
      { id: "surete", nom: "Agent de s\xFBret\xE9", pluriel: "Agents de s\xFBret\xE9", famille: "securite", statutMin: 2, equipement: "portiques", base: 0.5, poids: 2, menaces: { vol: 2, vandalisme: 8 } },
      { id: "operateur", nom: "Op\xE9rateur vid\xE9o", pluriel: "Op\xE9rateurs vid\xE9o", famille: "securite", statutMin: 2, equipement: "cameras", base: 0.6, poids: 2, menaces: { vol: 8 } },
      { id: "maitreChien", nom: "Ma\xEEtre-chien", pluriel: "Ma\xEEtres-chiens", famille: "securite", statutMin: 3, equipement: "chenil", base: 0.7, poids: 1, menaces: { vol: 12 } },
      { id: "technicien", nom: "Technicien de s\xE9curit\xE9", pluriel: "Techniciens de s\xE9curit\xE9", famille: "securite", statutMin: 1, equipement: "alarme", base: 0.8, poids: 1, unique: true, materielBase: 0.1, materielNiveau: 0.03 },
      { id: "chefSecurite", nom: "Chef de la s\xE9curit\xE9", pluriel: "Chefs de la s\xE9curit\xE9", famille: "securite", statutMin: 3, equipement: "pcSecurite", base: 1.2, poids: 1, unique: true, humainBase: 0.1, humainNiveau: 0.03 },
      { id: "pilote", nom: "Pilote de drone", pluriel: "Pilotes de drone", famille: "securite", statutMin: 4, equipement: "drones", base: 1, poids: 1, menaces: { vol: 25 } },
      { id: "assistant", nom: "Assistant restaurateur", pluriel: "Assistants restaurateurs", statutMin: 1, base: 1, poids: 2, partBase: 0.12, partNiveau: 0.03, plafond: 0.3 },
      { id: "mediateur", nom: "M\xE9diateur", pluriel: "M\xE9diateurs", statutMin: 0, base: 0.6, poids: 2, satisfactionBase: 1.5, satisfactionNiveau: 0.5, plafondTotal: 15 },
      { id: "accueil", nom: "Agent d'accueil", pluriel: "Agents d'accueil", statutMin: 0, base: 0.5, poids: 2, densiteBase: 0.06, densiteNiveau: 0.02 },
      { id: "communication", nom: "Charg\xE9 de communication", pluriel: "Charg\xE9s de communication", statutMin: 1, base: 1, poids: 1, unique: true, remiseBase: 0.1, remiseNiveau: 0.04, joursTousLes: 3 },
      { id: "conservateur", nom: "Conservateur", pluriel: "Conservateurs", statutMin: 2, base: 1.5, poids: 1, unique: true, oeuvres: 1, oeuvresNiveau6: 2 },
      { id: "regisseur", nom: "R\xE9gisseur des \u0153uvres", pluriel: "R\xE9gisseurs des \u0153uvres", statutMin: 2, base: 1, poids: 1, unique: true, probabilitePret: 0.15, remunerationBase: 0.1, remunerationNiveau: 0.03, enqueteBase: 0.02, enqueteNiveau: 0.01 },
      { id: "commissaire", nom: "Commissaire d'exposition", pluriel: "Commissaires d'exposition", statutMin: 3, base: 1.5, poids: 1, unique: true, attraitBase: 0.1, attraitNiveau: 0.03, remiseBase: 0.1, remiseNiveau: 0.03 },
      { id: "comptable", nom: "Comptable", pluriel: "Comptables", statutMin: 3, base: 1.2, poids: 1, unique: true, abattementBase: 0.05, abattementNiveau: 0.02 }
    ]
  },
  // Sécurité (docs/ECONOMIE.md, section 3), salle par salle. Chaque jour, à
  // une heure tirée au hasard, chaque espace subit un tirage de vol et un de
  // vandalisme : probabilité par jour = base × risque / (protection +
  // plancher), bornée entre min et max. Le risque vient des œuvres de
  // l'espace, la protection de son matériel et des agents qui le couvrent.
  // Un incident coûte `reputation` points tout de suite et `confiance`
  // points durables (retirés des bonus permanents).
  securite: {
    jourSemaine: 0,
    // l'enquête de la police, chaque dimanche
    menaces: {
      vol: { nom: "Vol", base: 35e-4, plancher: 4, min: 2e-4, max: 0.05, reputation: 3, confiance: 1 },
      vandalisme: { nom: "Vandalisme", base: 3e-3, plancher: 15, min: 0, max: 0.03, reputation: 2, confiance: 0.5, exposant: 1.5, diviseur: 10 }
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
    seuilsEmprunt: { 3: 0.05, 4: 0.03, 5: 0.015 }
  },
  // Détectives (docs/ECONOMIE.md, section 3) : engagés par mission, payés
  // d'avance à la semaine, `prime` du prix de l'œuvre à celui qui la ramène.
  // Chance par semaine = (base + niveau × pas) × efficacité. Tarif par
  // semaine = base × facteur^(niveau - 1) × grille du statut × prétention.
  // Niveau : œuvres retrouvées (seuils `xp`).
  detectives: {
    candidatsParSemaine: 3,
    tarifBase: 15,
    tarifNiveau: 1.25,
    chanceBase: 0.05,
    chanceNiveau: 0.015,
    xp: [1, 3, 6, 10, 15, 21, 28, 36, 45],
    durees: [2, 4, 8],
    prime: 0.05,
    piste: {
      probabilite: 0.15,
      prixPart: 0.6,
      joursReponse: 3,
      bonusPolice: 0.15,
      villes: ["Gen\xE8ve", "Anvers", "Londres", "Bruxelles", "Marseille", "Amsterdam", "Milan", "New York", "Hong Kong", "Vienne"]
    }
  },
  // Matériel installé dans un espace précis. Son prix suit la taille de la
  // salle (× places / 6). `vol`, `vandalisme` : protection de cet espace ;
  // `electronique` : renforcé par le technicien ; `requiert` : agent affecté
  // à la salle sans lequel il ne donne que `sans` ; `norme` : niveau de
  // sécurité exigé pour accrocher Chefs-d'œuvre (1) et Trésors (2) ;
  // `blindage` : la réserve n'attire presque plus les cambrioleurs ;
  // `lieux` : espaces où il s'installe (salles publiques par défaut).
  materielSalle: [
    { id: "porte", nom: "Porte blind\xE9e", prix: 300, statutMin: 0, vol: 5, lieux: ["public", "reserve", "atelier"] },
    { id: "alarme", nom: "Alarme", prix: 1500, statutMin: 1, vol: 15, electronique: true, lieux: ["public", "reserve", "atelier"] },
    { id: "cameras", nom: "Cam\xE9ras", prix: 4e3, statutMin: 2, vol: 20, vandalisme: 15, electronique: true, requiert: "operateur", sans: 0.5, lieux: ["public", "reserve", "atelier"] },
    { id: "vitrines", nom: "Vitrines s\xE9curis\xE9es", prix: 8e3, statutMin: 3, vol: 40, vandalisme: 60, lieux: ["public"] },
    { id: "blindage", nom: "Blindage", prix: 12e3, statutMin: 2, blindage: true, lieux: ["reserve"] },
    { id: "norme1", nom: "S\xE9curit\xE9 niveau 1", prix: 2e4, statutMin: 4, norme: 1, vol: 60, vandalisme: 30, lieux: ["public"] },
    { id: "norme2", nom: "S\xE9curit\xE9 niveau 2", prix: 6e4, statutMin: 5, prerequis: "norme1", norme: 2, vol: 150, vandalisme: 100, lieux: ["public"] }
  ],
  // Clé publique VAPID des notifications, la même que WikiDeck (publiée dans
  // son js/notifications.js) : les secrets d'Edge Function sont communs à tout
  // le projet Supabase, la clé privée y est déjà (VAPID_PRIVATE).
  push: { clePublique: "BDP0es16rH6pFdoCwUi3Qmy4n3EMWGSeFci5mMinNSipPNZuKeRR--vLf4D9PTrkdesZZ8bzGxui5-nYCRIiTIc" },
  notifications: [
    { id: "session", nom: "Fin de session" },
    { id: "arrivage", nom: "Nouvel arrivage" },
    { id: "expiration", nom: "Arrivage qui expire" },
    { id: "pret", nom: "Demande de pr\xEAt" },
    { id: "classement", nom: "Classement" },
    { id: "statut", nom: "Nouveau statut" },
    { id: "exposition", nom: "Fin d'exposition" },
    { id: "cambriolage", nom: "Vols, vandalisme et enqu\xEAtes" },
    { id: "personnel", nom: "Personnel" }
  ],
  // Rendu de la restauration (section 5). Chaque paramètre est une suite de
  // points [progression, valeur] interpolés ; `blocs` l'est géométriquement.
  rendu: {
    etapes: [
      { fin: 0.1, nom: "Consolidation" },
      { fin: 0.3, nom: "Nettoyage" },
      { fin: 0.55, nom: "D\xE9vernissage" },
      { fin: 0.8, nom: "R\xE9int\xE9gration" },
      { fin: 1, nom: "Vernis" }
    ],
    // Intensité de chaque couche selon la progression, de 1 (pleine) à 0.
    // Chaque étape efface la sienne : refixer les écailles, ôter la crasse
    // (et le voile qu'elle laisse, si `voileEtape` le dit), alléger le
    // vernis, combler les lacunes, puis la retouche finale.
    flou: [[0, 1], [0.1, 1], [0.3, 0.55], [0.55, 0.18], [0.8, 0.06], [1, 0]],
    vernis: [[0, 1], [0.3, 1], [0.55, 0]],
    crasse: [[0, 1], [0.1, 1], [0.3, 0]],
    lacunes: [[0, 0.06], [0.55, 0.06], [0.8, 0]],
    bordLacunes: [[0, 1], [0.1, 0.2]],
    craquelures: [[0, 0.75], [0.1, 0.6], [0.8, 0.45], [1, 0]],
    grain: [[0, 1], [0.8, 0.6], [1, 0]],
    supports: {
      peinture: {
        flou: 7,
        desature: 0.55,
        teinte: "#f2b861",
        teinteForce: 0.8,
        voile: "#4d3519",
        voileForce: 0.42,
        voileEtape: "crasse",
        crasse: "#21140a",
        crasseForce: 0.42,
        taches: 0.6,
        tachesFrequence: 8,
        craquelures: "#22160b",
        craqueluresForce: 0.75,
        cellules: 26,
        deformation: 0.35,
        epaisseur: 1.1,
        fond: "#cdbd9c",
        bordLacune: "#2a190b",
        bords: 0.1,
        grainLacunes: 30,
        regroupement: 0.5,
        anneau: 0.5,
        grain: 0.35
      },
      sculpture: {
        flou: 5,
        desature: 0.6,
        teinte: "#d9cdb8",
        teinteForce: 0.5,
        voile: "#bdb4a5",
        voileForce: 0.3,
        crasse: "#141210",
        crasseForce: 0.6,
        taches: 0.3,
        tachesFrequence: 10,
        craquelures: "#1d1a17",
        craqueluresForce: 0.5,
        cellules: 7,
        deformation: 0.45,
        epaisseur: 1.4,
        fond: "#d8d0c2",
        bordLacune: "#3a342c",
        bords: 0.45,
        grainLacunes: 9,
        anneau: 0.4,
        grain: 0.4
      },
      photographie: {
        flou: 4,
        desature: 0.8,
        teinte: "#e8c58f",
        teinteForce: 0.7,
        voile: "#cfd8e2",
        voileMode: "screen",
        voileForce: 0.6,
        voileBords: true,
        crasse: "#5a3d22",
        crasseForce: 0.35,
        taches: 1,
        tachesFrequence: 30,
        craquelures: "#f4f0e6",
        craqueluresForce: 0.35,
        cellules: 9,
        deformation: 0.5,
        epaisseur: 0.9,
        fond: "#f1ece1",
        bordLacune: "#8a7a62",
        bords: 0.55,
        grainLacunes: 10,
        anneau: 0.3,
        grain: 0.5
      },
      estampe: {
        flou: 4,
        desature: 0.5,
        teinte: "#e6c27e",
        teinteForce: 0.8,
        voile: "#a87a3c",
        voileForce: 0.18,
        crasse: "#6b4420",
        crasseForce: 0.4,
        taches: 1,
        tachesFrequence: 26,
        craquelures: "#9b8466",
        craqueluresForce: 0.3,
        cellules: 4,
        deformation: 0.2,
        epaisseur: 1,
        fond: "#efe5cc",
        bordLacune: "#9d8a68",
        bords: 0.65,
        grainLacunes: 8,
        anneau: 0.35,
        grain: 0.3
      }
    }
  },
  themes: [
    { id: "mouvement", nom: "Mouvement" },
    { id: "artiste", nom: "Artiste" },
    { id: "pays", nom: "Pays" },
    { id: "siecle", nom: "Si\xE8cle" },
    { id: "support", nom: "Support" }
  ]
};
function configEffective(surcharges) {
  return fusionner(CONFIG, surcharges || {});
}
function fusionner(base, sur) {
  if (Array.isArray(base)) {
    if (!sur || typeof sur !== "object") return base;
    return base.map((v, i) => Object.hasOwn(sur, i) ? fusionner(v, sur[i]) : v);
  }
  if (base && typeof base === "object") {
    if (!sur || typeof sur !== "object") return base;
    const r = { ...base };
    for (const [k, v] of Object.entries(sur)) r[k] = k in base ? fusionner(base[k], v) : v;
    return r;
  }
  return sur === void 0 || sur === null ? base : sur;
}

// js/moteur/regles.js
function niveau(cfg, n) {
  return cfg.niveaux[n] ?? cfg.niveaux[0];
}
function prestige(cfg, n) {
  return niveau(cfg, n).prestige;
}
function effets(cfg, etat) {
  const e = { revenus: 1, satisfaction: 0, efficacite: 0, revele: 0, remise: 0, securite: 0, salleForte: false };
  for (const id of etat.investissements || []) {
    const inv = cfg.investissements.find((i) => i.id === id);
    if (!inv) continue;
    const f = inv.effets || {};
    if (f.revenus) e.revenus *= f.revenus;
    if (f.satisfaction) e.satisfaction += f.satisfaction;
    if (f.efficacite) e.efficacite += f.efficacite;
    if (f.revele) e.revele = Math.max(e.revele, f.revele);
    if (f.remise) e.remise = Math.max(e.remise, f.remise);
    if (f.securite) e.securite = Math.max(e.securite, f.securite);
    if (f.salleForte) e.salleForte = true;
  }
  return e;
}
function nouveaute(cfg, jours) {
  const n = cfg.visiteurs.nouveaute;
  if (jours < n.jusquaUn) return n.depart - (n.depart - 1) * jours / n.jusquaUn;
  if (jours <= n.plateauJusqua) return 1;
  const pas = Math.floor((jours - n.plateauJusqua) / n.baisseTousLes);
  return Math.max(n.plancher, 1 - n.baissePas * pas);
}
function joursPourNouveaute(cfg, valeur) {
  const n = cfg.visiteurs.nouveaute;
  return Math.max(0, Math.round((n.depart - valeur) * n.jusquaUn / (n.depart - 1)));
}
function prixOptimal(cfg, reputation) {
  return cfg.visiteurs.prix.optimalBase + reputation / cfg.visiteurs.prix.optimalDiviseur;
}
function facteurPrix(cfg, prix, reputation) {
  return Math.exp(-(prix - 1) / prixOptimal(cfg, reputation));
}
function facteurReputation(cfg, reputation) {
  return cfg.visiteurs.reputationBase + reputation / cfg.visiteurs.reputationDiviseur;
}
function siecle(an) {
  if (an === void 0 || an === null || Number.isNaN(an)) return null;
  if (an > 0) return Math.ceil(an / 100);
  return -(Math.floor(-an / 100) + 1);
}
function valeurTheme(oeuvre, type) {
  switch (type) {
    case "artiste":
      return oeuvre.artiste?.q ?? null;
    case "mouvement":
      return oeuvre.mouvement?.q ?? null;
    case "pays":
      return oeuvre.pays?.q ?? null;
    case "siecle":
      return siecle(oeuvre.an);
    case "support":
      return oeuvre.support ?? null;
    default:
      return null;
  }
}
function estConforme(oeuvre, theme) {
  if (!theme) return true;
  const v = valeurTheme(oeuvre, theme.type);
  return v !== null && v === theme.valeur;
}
function frequentationAnnualisee(cfg, historique) {
  const n = cfg.frequentation.joursMoyenne;
  const derniers = historique.slice(-n);
  if (!derniers.length) return 0;
  const moyenne = derniers.reduce((s, h) => s + h.visiteurs, 0) / derniers.length;
  return Math.round(moyenne * cfg.frequentation.joursAnnee);
}
function statutAtteint(cfg, annualisee) {
  let s = 0;
  cfg.statuts.forEach((st, i) => {
    if (annualisee >= st.seuil) s = i;
  });
  return s;
}
function borner(x, min, max) {
  return Math.min(max, Math.max(min, x));
}

// js/moteur/batiment.js
function espacesPublics(etat) {
  const b = etat.batiment;
  const liste = b.salles.filter((s) => !s.chantier).map((s) => ({ ...s, type: "salle" }));
  if (b.cabinet) liste.push({ ...b.cabinet, id: "cabinet", type: "cabinet" });
  if (b.jardin) liste.push({ ...b.jardin, id: "jardin", type: "jardin" });
  return liste;
}
function espace(etat, id) {
  return espacesPublics(etat).find((e) => e.id === id) || null;
}
function contenuEspace(etat, id) {
  const e = espace(etat, id);
  const places = Array(e ? e.places : 0).fill(null);
  for (const o of Object.values(etat.oeuvres)) {
    if (o.lieu === "espace" && o.espace === id && o.place < places.length) places[o.place] = o.id;
  }
  return places;
}
function placesPubliques(etat) {
  let n = espacesPublics(etat).reduce((s, e) => s + e.places, 0);
  if (etat.batiment.exposition) n += etat.batiment.exposition.places;
  return n;
}
function supportsEspace(cfg, type) {
  return cfg.espaces[type]?.supports || [];
}
function refusAccrochage(cfg, etat, oeuvre, espaceId) {
  const e = espace(etat, espaceId);
  if (!e) return "Espace inconnu";
  if (oeuvre.progression < 1) return "Restauration inachev\xE9e";
  if (oeuvre.travaux) return "En travaux \xE0 l'atelier";
  if ((oeuvre.usure || 0) >= (cfg.usure?.maxExposable ?? Infinity)) return "Trop ab\xEEm\xE9e : \xE0 r\xE9parer";
  if (!supportsEspace(cfg, e.type).includes(oeuvre.support)) {
    return oeuvre.support === "estampe" || oeuvre.support === "photographie" ? "R\xE9serv\xE9 au cabinet d'arts graphiques" : e.type === "jardin" ? "Sculptures uniquement" : "Support non exposable ici";
  }
  const requise = cfg.securiteRequise[oeuvre.niveau] || 0;
  if (requise > normeLieu(cfg, etat, espaceId)) return `S\xE9curit\xE9 niveau ${requise} requise dans cette salle`;
  return null;
}
function normeLieu(cfg, etat, lieu) {
  return (etat.securite?.salles?.[lieu] || []).reduce((n, id) => Math.max(n, cfg.materielSalle?.find((m) => m.id === id)?.norme || 0), 0);
}

// js/moteur/alea.js
function empreinte(texte) {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function generateur(graine) {
  let a = typeof graine === "number" ? graine >>> 0 : empreinte(String(graine));
  return function suivant() {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function choixPondere(options, alea) {
  const total = options.reduce((s, [, p]) => s + Math.max(0, p), 0);
  if (total <= 0) return void 0;
  let x = alea() * total;
  for (const [valeur, poids] of options) {
    x -= Math.max(0, poids);
    if (x < 0) return valeur;
  }
  return options[options.length - 1][0];
}
function entier(n, alea) {
  return Math.floor(alea() * n);
}

// js/moteur/noms.js
var PRENOMS = [
  "Camille",
  "Louise",
  "Jeanne",
  "Alice",
  "L\xE9a",
  "Chlo\xE9",
  "In\xE8s",
  "Manon",
  "Zo\xE9",
  "Lina",
  "Juliette",
  "Agathe",
  "Margaux",
  "Clara",
  "Rose",
  "Anna",
  "\xC9lise",
  "Salom\xE9",
  "Nina",
  "Mila",
  "Yasmine",
  "Sofia",
  "Amina",
  "H\xE9l\xE8ne",
  "Mathilde",
  "Victoire",
  "Constance",
  "Garance",
  "Iris",
  "Romane",
  "Lucas",
  "Hugo",
  "Louis",
  "Gabriel",
  "Arthur",
  "Jules",
  "Adam",
  "Rapha\xEBl",
  "Paul",
  "Victor",
  "Antoine",
  "Th\xE9o",
  "Nathan",
  "Mathis",
  "L\xE9on",
  "Sacha",
  "\xC9lias",
  "Malo",
  "Baptiste",
  "Simon",
  "Karim",
  "Youssef",
  "Mehdi",
  "Samuel",
  "Bastien",
  "\xC9tienne",
  "F\xE9lix",
  "Augustin",
  "Marius",
  "No\xE9",
  "Dominique",
  "Claude",
  "Alix",
  "Andr\xE9a",
  "Charlie",
  "Eden",
  "Maxime",
  "Sasha",
  "Morgan",
  "Lou"
];
var NOMS = [
  "Martin",
  "Bernard",
  "Dubois",
  "Thomas",
  "Robert",
  "Richard",
  "Petit",
  "Durand",
  "Leroy",
  "Moreau",
  "Simon",
  "Laurent",
  "Lefebvre",
  "Michel",
  "Garcia",
  "David",
  "Bertrand",
  "Roux",
  "Vincent",
  "Fournier",
  "Morel",
  "Girard",
  "Andr\xE9",
  "Mercier",
  "Dupont",
  "Lambert",
  "Bonnet",
  "Fran\xE7ois",
  "Martinez",
  "Legrand",
  "Garnier",
  "Faure",
  "Rousseau",
  "Blanc",
  "Gu\xE9rin",
  "Muller",
  "Henry",
  "Roussel",
  "Nicolas",
  "Perrin",
  "Morin",
  "Mathieu",
  "Cl\xE9ment",
  "Gauthier",
  "Dumont",
  "Lopez",
  "Fontaine",
  "Chevalier",
  "Robin",
  "Masson",
  "Benali",
  "Haddad",
  "Nguyen",
  "Kowalski",
  "Rossi",
  "Ferreira",
  "Diallo",
  "Okafor",
  "Novak",
  "Lindqvist",
  "Delacroix",
  "Vasseur",
  "Marchand",
  "Lemoine",
  "Carpentier",
  "Barbier",
  "Renard",
  "Picard",
  "Aubert",
  "Charpentier"
];

// js/moteur/personnel.js
function role(cfg, id) {
  return cfg.personnel.roles.find((r) => r.id === id) || null;
}
function rolesOuverts(cfg, etat) {
  return cfg.personnel.roles.filter((r) => r.statutMin <= etat.statut && (!r.equipement || equipementPresent(etat, r.equipement)));
}
function equipementPresent(etat, id) {
  return (etat.investissements || []).includes(id) || Object.values(etat.securite?.salles || {}).some((l) => l.includes(id));
}
function minutesPourNiveau(cfg, n) {
  return n <= 1 ? 0 : (cfg.personnel.experience[n - 2] ?? 0) * 60;
}
function niveauEmploye(cfg, minutes) {
  let n = 1;
  cfg.personnel.experience.forEach((h, i) => {
    if (minutes >= h * 60) n = i + 2;
  });
  return Math.min(cfg.personnel.niveauMax, n);
}
var efficacite = (p) => p?.efficacite ?? 1;
function employes(etat, roleId = null) {
  const liste = etat.personnel?.employes || [];
  return roleId ? liste.filter((e) => e.role === roleId) : liste;
}
function avecNiveaux(cfg, etat) {
  return employes(etat).map((e) => ({ ...e, niveau: niveauEmploye(cfg, e.minutes) }));
}
function effetsPersonnel(cfg, etat) {
  const equipe = avecNiveaux(cfg, etat);
  const de = (id) => equipe.filter((e2) => e2.role === id);
  const force = (e2) => e2.niveau * efficacite(e2);
  const meilleur = (id) => de(id).reduce((m, e2) => !m || force(e2) > force(m) ? e2 : m, null);
  const r = (id) => role(cfg, id) || {};
  const e = {
    gardiens: de("gardien").length,
    menaces: { nuit: 0, jour: 0, vandalisme: 0 },
    technicien: 0,
    enquete: 0,
    satisfaction: 0,
    densite: 0,
    assistants: de("assistant").sort((a, b) => b.niveau - a.niveau || a.id.localeCompare(b.id)),
    communication: null,
    conservateur: 0,
    regisseur: null,
    commissaire: null,
    abattement: 0
  };
  const chef = meilleur("chefSecurite");
  const kChef = chef ? 1 + (r("chefSecurite").humainBase + r("chefSecurite").humainNiveau * chef.niveau) * efficacite(chef) : 1;
  for (const x of equipe) {
    for (const [m, v] of Object.entries(r(x.role).menaces || {})) e.menaces[m] += v * x.niveau * efficacite(x) * kChef;
  }
  const tech = meilleur("technicien");
  if (tech) e.technicien = (r("technicien").materielBase + r("technicien").materielNiveau * tech.niveau) * efficacite(tech);
  const med = r("mediateur");
  e.satisfaction = Math.min(
    med.plafondTotal ?? Infinity,
    de("mediateur").reduce((s, x) => s + (med.satisfactionBase + med.satisfactionNiveau * x.niveau) * efficacite(x), 0)
  );
  const acc = r("accueil");
  e.densite = de("accueil").reduce((s, x) => s + (acc.densiteBase + acc.densiteNiveau * x.niveau) * efficacite(x), 0);
  const com = meilleur("communication");
  if (com) {
    const c = r("communication");
    e.communication = { remise: Math.min(0.9, (c.remiseBase + c.remiseNiveau * com.niveau) * efficacite(com)), jours: Math.floor(com.niveau / c.joursTousLes) };
  }
  const cons = meilleur("conservateur");
  if (cons) e.conservateur = cons.niveau >= 6 ? r("conservateur").oeuvresNiveau6 : r("conservateur").oeuvres;
  const reg = meilleur("regisseur");
  if (reg) {
    const g = r("regisseur");
    e.regisseur = {
      probabilitePret: g.probabilitePret,
      remuneration: (g.remunerationBase + g.remunerationNiveau * reg.niveau) * efficacite(reg),
      enquete: (g.enqueteBase + g.enqueteNiveau * reg.niveau) * efficacite(reg)
    };
    e.enquete += e.regisseur.enquete;
  }
  const comm = meilleur("commissaire");
  if (comm) {
    const c = r("commissaire");
    e.commissaire = {
      attrait: (c.attraitBase + c.attraitNiveau * comm.niveau) * efficacite(comm),
      remise: Math.min(0.9, (c.remiseBase + c.remiseNiveau * comm.niveau) * efficacite(comm))
    };
  }
  const compta = meilleur("comptable");
  if (compta) {
    const c = r("comptable");
    e.abattement = Math.min(0.9, (c.abattementBase + c.abattementNiveau * compta.niveau) * efficacite(compta));
  }
  return e;
}
function nomTire(alea) {
  return `${PRENOMS[entier(PRENOMS.length, alea)]} ${NOMS[entier(NOMS.length, alea)]}`;
}
function profil(cfg, graine) {
  const p = cfg.personnel.profil;
  if (!p) return {};
  const alea = generateur(`${graine}:profil`);
  const cloche = (alea() + alea()) / 2;
  const eff = p.efficaciteMin + (p.efficaciteMax - p.efficaciteMin) * cloche;
  const salaire = Math.min(p.salaireMax, Math.max(p.salaireMin, 1 + p.suit * (eff - 1) + p.ecart * (alea() - 0.5)));
  return { efficacite: Math.round(eff * 100) / 100, salaire: Math.round(salaire * 100) / 100 };
}
function personne(cfg, { id, role: r, niveau: niveau2, graine }) {
  const alea = generateur(`${graine}:nom`);
  return { id, nom: nomTire(alea), role: r, niveau: niveau2, minutes: minutesPourNiveau(cfg, niveau2), ...profil(cfg, graine) };
}
function tirerCandidats(cfg, etat, jour) {
  const p = cfg.personnel;
  const alea = generateur(`${etat.graine}:candidats:${jour}`);
  const ouverts = rolesOuverts(cfg, etat);
  const max = p.niveauCandidatMax[etat.statut] ?? p.niveauMax;
  const candidats = [];
  for (let i = 0; i < p.candidatsParSemaine; i++) {
    const r = choixPondere(ouverts.map((x) => [x.id, x.poids]), alea);
    const niveau2 = choixPondere(Array.from({ length: max }, (_, k) => [k + 1, max - k]), alea);
    candidats.push({ ...personne(cfg, { id: `c${jour}-${i}`, role: r, niveau: niveau2, graine: `${etat.graine}:c${jour}-${i}` }), expire: jour + p.validiteCandidatsJours });
  }
  return candidats;
}

// js/moteur/etat.js
var FORMAT = 4;
var MATERIEL_FORMAT_4 = {
  serrures: ["porte", "public"],
  alarme: ["alarme", "public"],
  video: ["cameras", "public"],
  vitrines: ["vitrines", "public"],
  securite1: ["norme1", "public"],
  securite2: ["norme2", "public"],
  salleForte: ["blindage", "reserve"]
};
function migrer(etat, cfg = null) {
  if (!etat || typeof etat !== "object" || !etat.batiment || !etat.oeuvres) {
    throw new Error("\xC9tat du mus\xE9e illisible");
  }
  if ((etat.format || 0) > FORMAT) throw new Error("\xC9tat produit par une version plus r\xE9cente");
  const e = { ...etat };
  if ((e.format || 1) < 2) {
    const anciens = e.investissements || [];
    const employes2 = [];
    const jour = e.jourFerme + 1;
    const ajouter = (role2, niveau2, i) => {
      const id = `e${jour}-m${i}`;
      const p = cfg ? personne(cfg, { id, role: role2, niveau: niveau2, graine: `${e.graine}:migration:${i}` }) : { id, nom: "?", role: role2, minutes: 0 };
      const { niveau: _n, ...employe } = p;
      employes2.push(employe);
    };
    ajouter("gardien", 1, 0);
    if (anciens.includes("mediateurs")) ajouter("mediateur", 3, 1);
    if (anciens.includes("conservateur")) ajouter("conservateur", 3, 2);
    e.investissements = anciens.filter((i) => i !== "mediateurs" && i !== "conservateur");
    e.personnel = e.personnel || { employes: employes2, candidats: [], arrieres: 0 };
    if (cfg && !e.personnel.candidats.length) e.personnel.candidats = tirerCandidats(cfg, e, jour);
    e.securite = e.securite || { historique: [] };
  }
  if ((e.format || 1) < 3) {
    for (const x of e.personnel?.employes || []) if (x.role === "securite") x.role = "veilleur";
    if (e.personnel) e.personnel.candidats = (e.personnel.candidats || []).map((c) => c.role === "securite" ? { ...c, role: "veilleur" } : c);
  }
  if ((e.format || 1) < 4) {
    const valeur = (id) => Object.values(e.oeuvres).filter((o) => o.lieu === "espace" && o.espace === id).reduce((s, o) => s + (cfg?.niveaux?.[o.niveau]?.prestige ?? 1), 0);
    const salles = (e.batiment?.salles || []).map((s) => s.id).sort((a, b) => valeur(b) - valeur(a));
    const precieuse = salles[0] || "s1";
    e.securite = { historique: [], ...e.securite || {}, salles: { ...e.securite?.salles || {} } };
    const garde = [];
    for (const ancien of e.investissements || []) {
      const cible = MATERIEL_FORMAT_4[ancien];
      if (!cible) {
        garde.push(ancien);
        continue;
      }
      const lieu = cible[1] === "reserve" ? "reserve" : precieuse;
      e.securite.salles[lieu] = [.../* @__PURE__ */ new Set([...e.securite.salles[lieu] || [], cible[0]])];
    }
    e.investissements = garde;
    const enqueteurs = (e.personnel?.employes || []).filter((x) => x.role === "enqueteur");
    if (enqueteurs.length) {
      e.detectives = e.detectives || { carnet: [], candidats: [] };
      for (const x of enqueteurs) e.detectives.carnet.push({ id: `d-${x.id}`, nom: x.nom, xp: 0, efficacite: x.efficacite ?? 1, salaire: x.salaire ?? 1 });
      e.personnel.employes = e.personnel.employes.filter((x) => x.role !== "enqueteur");
    }
    let rang = 0;
    for (const x of e.personnel?.employes || []) {
      if (x.affectation) continue;
      if (x.role === "gardien") x.affectation = [salles[rang++ % Math.max(1, salles.length)] || "s1"];
      else if (["veilleur", "surete", "operateur", "maitreChien", "pilote"].includes(x.role)) x.affectation = [precieuse];
    }
  }
  e.format = FORMAT;
  return e;
}
function copie(etat) {
  return typeof structuredClone === "function" ? structuredClone(etat) : JSON.parse(JSON.stringify(etat));
}
function evenement(etat, jour, type, donnees = {}) {
  const id = `${type}:${jour}:${etat.evenements.length}`;
  etat.evenements.push({ id, jour, type, ...donnees, notifie: false });
  if (etat.evenements.length > 200) etat.evenements = etat.evenements.slice(-200);
}

// js/moteur/lieux.js
function ravivage(cfg) {
  return joursPourNouveaute(cfg, cfg.atelier?.nouveaute ?? cfg.visiteurs.nouveaute.depart);
}
function sortirDuPublic(o, jour) {
  o.sortieLe = jour;
}

// js/moteur/atelier.js
var usure = (o) => o?.usure || 0;
function facteurUsure(cfg, o) {
  return 1 - usure(o) * (cfg.usure?.effet ?? 0);
}
function user(cfg, o) {
  if (!cfg.usure) return;
  o.usure = Math.min(1, Math.round((usure(o) + cfg.usure.parJour) * 1e4) / 1e4);
}
function abimer(o, quantite) {
  o.usure = Math.min(1, Math.round((usure(o) + quantite) * 1e4) / 1e4);
}
function finirTravaux(cfg, etat, J, ramener2) {
  const faits = [];
  for (const o of Object.values(etat.oeuvres)) {
    if (!o.travaux || o.travaux.fin > J) continue;
    const t = o.travaux;
    delete o.travaux;
    o.usure = 0;
    o.ravivee = true;
    ramener2(cfg, etat, o.id, J);
    if (o.lieu === "espace") {
      o.joursExpo = Math.min(o.joursExpo || 0, ravivage(cfg));
      delete o.ravivee;
    }
    evenement(etat, J, "atelier", { oeuvre: o.id, titre: o.titre, travaux: t.type });
    faits.push({ type: "atelier", oeuvre: o.id, titre: o.titre, travaux: t.type, lieu: o.lieu });
  }
  return faits;
}

// js/moteur/visiteurs.js
function espacesOuverts(cfg, etat, jour) {
  const aGarder = [];
  for (const e of espacesPublics(etat)) {
    const ids = contenuEspace(etat, e.id).filter((x2) => x2 !== null);
    if (ids.length) aGarder.push({ id: e.id, valeur: ids.reduce((s, id) => s + prestige(cfg, etat.oeuvres[id].niveau), 0) });
  }
  const x = etat.expositions?.courante;
  if (x && (jour === void 0 || jour >= x.debut && jour < x.fin)) {
    const valeur = x.oeuvres.reduce((s, id) => s + prestige(cfg, etat.oeuvres[id]?.niveau ?? 0), 0) + x.emprunts.reduce((s, em) => s + prestige(cfg, em.niveau), 0);
    aGarder.push({ id: "exposition", valeur });
  }
  aGarder.sort((a, b) => b.valeur - a.valeur || String(a.id).localeCompare(String(b.id)));
  const gardiens = employes(etat, "gardien");
  const couverts = new Set(gardiens.flatMap((g) => g.affectation || []));
  let libres = gardiens.filter((g) => !(g.affectation || []).length).length;
  const ouverts = /* @__PURE__ */ new Set();
  for (const e of aGarder) {
    if (couverts.has(e.id)) ouverts.add(e.id);
    else if (libres > 0) {
      ouverts.add(e.id);
      libres--;
    }
  }
  return { ouverts, aGarder: aGarder.length, fermes: aGarder.filter((e) => !ouverts.has(e.id)).map((e) => e.id) };
}
function effetCampagnes(cfg, etat, jour) {
  const c = etat.campagne;
  if (!c || jour < c.debut || jour >= c.fin) return 1;
  return cfg.campagnes.find((x) => x.id === c.id)?.multiplicateur ?? 1;
}
function apports(cfg, etat, jour) {
  const liste = [];
  const parId = new Map(espacesPublics(etat).map((e) => [e.id, e]));
  const { ouverts } = espacesOuverts(cfg, etat, jour);
  for (const o of Object.values(etat.oeuvres)) {
    if (o.lieu !== "espace") continue;
    const e = parId.get(o.espace);
    if (!e || !ouverts.has(e.id)) continue;
    const coherence = e.theme ? estConforme(o, e.theme) ? cfg.visiteurs.theme.conforme : cfg.visiteurs.theme.nonConforme : 1;
    const attrait = cfg.espaces[e.type]?.attrait ?? 1;
    liste.push({
      id: o.id,
      espace: e.id,
      valeur: cfg.visiteurs.parPrestige * prestige(cfg, o.niveau) * nouveaute(cfg, o.joursExpo) * coherence * attrait * facteurUsure(cfg, o)
    });
  }
  const expo = etat.expositions?.courante;
  if (expo && jour >= expo.debut && jour < expo.fin && ouverts.has("exposition")) {
    const commissaire = effetsPersonnel(cfg, etat).commissaire;
    const x = { ...cfg.expositions, attrait: cfg.expositions.attrait * (1 + (commissaire?.attrait || 0)) };
    for (const id of expo.oeuvres) {
      const o = etat.oeuvres[id];
      if (!o || o.lieu !== "exposition") continue;
      liste.push({
        id,
        espace: "exposition",
        valeur: cfg.visiteurs.parPrestige * prestige(cfg, o.niveau) * nouveaute(cfg, o.joursExpo) * x.coherence * x.attrait
      });
    }
    for (const em of expo.emprunts) {
      liste.push({
        id: em.id,
        emprunt: true,
        espace: "exposition",
        valeur: cfg.visiteurs.parPrestige * prestige(cfg, em.niveau) * nouveaute(cfg, jour - expo.debut) * x.coherence * x.attrait
      });
    }
  }
  return liste;
}
function multiplicateurGlobal(cfg, etat, jour) {
  const travaux = (etat.chantiers || []).length ? cfg.chantiers?.malus ?? 1 : 1;
  return facteurReputation(cfg, etat.reputation) * facteurPrix(cfg, etat.prixBillet, etat.reputation) * effetCampagnes(cfg, etat, jour) * travaux;
}
function visiteursDuJour(cfg, etat, jour) {
  const total = apports(cfg, etat, jour).reduce((s, a) => s + a.valeur, 0);
  return Math.round(total * multiplicateurGlobal(cfg, etat, jour));
}
function detailVisiteurs(cfg, etat, jour) {
  const liste = apports(cfg, etat, jour);
  const m = multiplicateurGlobal(cfg, etat, jour);
  return {
    total: Math.round(liste.reduce((s, a) => s + a.valeur, 0) * m),
    multiplicateur: m,
    parOeuvre: liste.map((a) => ({ ...a, visiteurs: a.valeur * m }))
  };
}
function partThematique(cfg, etat) {
  let garnis = 0;
  let coherents = 0;
  for (const e of espacesPublics(etat)) {
    const oeuvres = Object.values(etat.oeuvres).filter((o) => o.lieu === "espace" && o.espace === e.id);
    if (!oeuvres.length) continue;
    garnis++;
    if (!e.theme) continue;
    const conformes = oeuvres.filter((o) => estConforme(o, e.theme)).length;
    if (conformes / oeuvres.length >= cfg.satisfaction.seuilCoherence) coherents++;
  }
  return garnis ? coherents / garnis : 0;
}
function seuilDensite(cfg, etat) {
  return cfg.satisfaction.densiteSeuil * (1 + effetsPersonnel(cfg, etat).densite);
}
function penaliteAffluence(cfg, etat, visiteurs) {
  const s = cfg.satisfaction;
  const places = placesPubliques(etat);
  if (!places) return 0;
  const densite = visiteurs / places;
  const seuil = seuilDensite(cfg, etat);
  if (densite <= seuil) return 0;
  return Math.min(s.penaliteMax, (densite / seuil - 1) * s.penaliteCoef);
}
function satisfaction(cfg, etat, visiteurs) {
  const s = cfg.satisfaction;
  const v = s.base + effets(cfg, etat).satisfaction + effetsPersonnel(cfg, etat).satisfaction + s.bonusThematique * partThematique(cfg, etat) - penaliteAffluence(cfg, etat, visiteurs);
  return borner(v, 0, 100);
}
function cibleReputation(cfg, etat, sat) {
  return Math.min(cfg.reputation.max, sat + (etat.bonusPermanents || 0));
}
function reputationSuivante(cfg, etat, sat) {
  const cible = cibleReputation(cfg, etat, sat);
  return borner(etat.reputation + cfg.reputation.vitesse * (cible - etat.reputation), 0, cfg.reputation.max);
}

// js/moteur/securite.js
var MENACES = ["vol", "vandalisme"];
function lieuxSecurises(cfg, etat) {
  const l = espacesPublics(etat).map((e) => ({ id: e.id, nom: e.nom || cfg.espaces[e.type]?.nom || e.id, type: "public", places: e.places }));
  if (etat.batiment.exposition) l.push({ id: "exposition", nom: cfg.espaces.exposition.nom, type: "exposition", places: etat.batiment.exposition.places });
  l.push({ id: "reserve", nom: "R\xE9serve", type: "reserve", places: etat.batiment.reserve.places });
  l.push({ id: "atelier", nom: "Atelier", type: "atelier", places: 6 });
  return l;
}
function materielDe(etat, lieu) {
  return etat.securite?.salles?.[lieu] || [];
}
var publicOuExpo = (type) => type === "public" || type === "exposition";
var affectation = (x) => x.affectation || [];
function lieuOeuvre(o) {
  if (o.lieu === "espace") return o.espace;
  if (o.lieu === "exposition" || o.lieu === "reserve" || o.lieu === "atelier") return o.lieu;
  return null;
}
function affluence(cfg, etat, jour) {
  const a = cfg.securite.affluence;
  const places = placesPubliques(etat);
  if (!places) return 0.5;
  const densite = visiteursDuJour(cfg, etat, jour ?? etat.jourFerme + 1) / places;
  return Math.min(a.max, 0.5 + densite / a.densiteRef);
}
function poidsVol(cfg, etat, o, type, aff) {
  const s = cfg.securite;
  if (publicOuExpo(type)) return (s.portabilite[o.support] ?? 1) * aff;
  if (type === "reserve") return materielDe(etat, "reserve").some((id) => cfg.materielSalle.find((m) => m.id === id)?.blindage) ? s.poids.reserveBlindee : s.poids.reserve;
  return s.poids[type] ?? 0;
}
var celebrite = (cfg, n) => prestige(cfg, n) ** cfg.securite.menaces.vandalisme.exposant / cfg.securite.menaces.vandalisme.diviseur;
function risques(cfg, etat, jour) {
  const lieux = lieuxSecurises(cfg, etat);
  const types = new Map(lieux.map((l) => [l.id, l.type]));
  const r = Object.fromEntries(lieux.map((l) => [l.id, { vol: 0, vandalisme: 0 }]));
  const aff = affluence(cfg, etat, jour);
  for (const o of Object.values(etat.oeuvres)) {
    const l = lieuOeuvre(o);
    if (!l || !r[l]) continue;
    const type = types.get(l);
    r[l].vol += prestige(cfg, o.niveau) * poidsVol(cfg, etat, o, type, aff);
    if (publicOuExpo(type)) r[l].vandalisme += celebrite(cfg, o.niveau);
  }
  for (const em of etat.expositions?.courante?.emprunts || []) {
    if (!r.exposition) continue;
    r.exposition.vol += prestige(cfg, em.niveau) * (cfg.securite.portabilite[em.support] ?? 1) * aff;
    r.exposition.vandalisme += celebrite(cfg, em.niveau);
  }
  return r;
}
function protections(cfg, etat) {
  const ep = effetsPersonnel(cfg, etat);
  const lieux = lieuxSecurises(cfg, etat);
  const p = Object.fromEntries(lieux.map((l) => [l.id, { vol: 0, vandalisme: 0 }]));
  const equipe = avecNiveaux(cfg, etat);
  const chef = role(cfg, "chefSecurite");
  const meilleurChef = equipe.filter((x) => x.role === "chefSecurite").reduce((m, x) => !m || x.niveau * efficacite(x) > m.niveau * efficacite(m) ? x : m, null);
  const kChef = meilleurChef ? 1 + (chef.humainBase + chef.humainNiveau * meilleurChef.niveau) * efficacite(meilleurChef) : 1;
  const presents = (lieu, metier) => equipe.some((x) => x.role === metier && affectation(x).includes(lieu));
  for (const l of lieux) {
    for (const id of materielDe(etat, l.id)) {
      const m = cfg.materielSalle.find((x) => x.id === id);
      if (!m) continue;
      let k = m.electronique ? 1 + ep.technicien : 1;
      if (m.requiert && !presents(l.id, m.requiert)) k *= m.sans ?? 0;
      for (const menace of MENACES) if (m[menace]) p[l.id][menace] += m[menace] * k;
    }
  }
  for (const id of etat.investissements || []) {
    const f = cfg.investissements.find((i) => i.id === id)?.effets;
    if (!f || !MENACES.some((m) => f[m])) continue;
    let k = f.electronique ? 1 + ep.technicien : 1;
    if (f.requiert && !employes(etat, f.requiert).length) k *= f.sans ?? 0;
    for (const l of lieux) {
      if (f.vandalisme && publicOuExpo(l.type)) p[l.id].vandalisme += f.vandalisme * k;
      if (f.vol) p[l.id].vol += f.vol * k;
    }
  }
  for (const x of equipe) {
    const menaces = role(cfg, x.role)?.menaces;
    const couvre = affectation(x).filter((id) => p[id]);
    if (!menaces || !couvre.length) continue;
    for (const id of couvre) {
      for (const [m, v] of Object.entries(menaces)) if (p[id][m] !== void 0) p[id][m] += v * x.niveau * efficacite(x) * kChef / couvre.length;
    }
  }
  return p;
}
function probabilites(cfg, etat, jour) {
  const r = risques(cfg, etat, jour);
  const s = protections(cfg, etat);
  const p = {};
  for (const [lieu, rl] of Object.entries(r)) {
    p[lieu] = {};
    for (const m of MENACES) {
      const c = cfg.securite.menaces[m];
      p[lieu][m] = rl[m] > 0 ? borner(c.base * rl[m] / (s[lieu][m] + c.plancher), c.min, c.max) : 0;
    }
  }
  return p;
}
function retirer(etat, o, J) {
  if (o.lieu === "espace" || o.lieu === "exposition") sortirDuPublic(o, J);
  if (o.lieu === "exposition") {
    const x = etat.expositions.courante;
    if (x) x.oeuvres = x.oeuvres.filter((id) => id !== o.id);
  }
  delete o.espace;
  delete o.place;
  delete o.retour;
}
function perdreReputation(cfg, etat, m) {
  const c = cfg.securite.menaces[m];
  etat.reputation = Math.max(0, etat.reputation - c.reputation);
  etat.bonusPermanents = (etat.bonusPermanents || 0) - (c.confiance || 0);
}
function tirages(cfg, etat, J) {
  const faits = [];
  const p = probabilites(cfg, etat, J);
  const lieux = lieuxSecurises(cfg, etat);
  const aff = affluence(cfg, etat, J);
  for (const l of lieux) {
    for (const m of MENACES) {
      if (!(p[l.id]?.[m] > 0)) continue;
      const alea = generateur(`${etat.graine}:${m}:${l.id}:${J}`);
      if (!(alea() < p[l.id][m])) continue;
      const heure = entier(24, alea);
      const ici = Object.values(etat.oeuvres).filter((o) => lieuOeuvre(o) === l.id && etat.session?.oeuvre !== o.id && !o.travaux);
      if (m === "vol") {
        const o = choixPondere(ici.map((x) => [x, prestige(cfg, x.niveau) * poidsVol(cfg, etat, x, l.type, aff)]), alea);
        if (!o) continue;
        retirer(etat, o, J);
        o.lieu = "volee";
        o.voleeLe = J;
        perdreReputation(cfg, etat, m);
        const taux = cfg.charges?.assurance?.indemnite || 0;
        if (taux) etat.indemnites = (etat.indemnites || 0) + Math.round(niveau(cfg, o.niveau).prix * taux);
        etat.securite.historique.push({ type: "vol", jour: J, heure, lieu: l.id, oeuvre: o.id, titre: o.titre, niveau: o.niveau, probabilite: p[l.id][m] });
        evenement(etat, J, "cambriolage", { oeuvre: o.id, titre: o.titre, lieu: l.nom, heure });
        faits.push({ type: "cambriolage", oeuvre: o.id, titre: o.titre, lieu: l.nom, heure });
      } else {
        const o = choixPondere(ici.map((x) => [x, celebrite(cfg, x.niveau)]), alea);
        if (!o) continue;
        const [min, max] = cfg.usure.vandalisme;
        const degats = min + (max - min) * alea();
        retirer(etat, o, J);
        o.lieu = "reserve";
        abimer(o, degats);
        perdreReputation(cfg, etat, m);
        etat.securite.historique.push({ type: "vandalisme", jour: J, heure, lieu: l.id, oeuvre: o.id, titre: o.titre, niveau: o.niveau, degats, probabilite: p[l.id][m] });
        evenement(etat, J, "vandalisme", { oeuvre: o.id, titre: o.titre, lieu: l.nom, degats: Math.round(degats * 100) });
        faits.push({ type: "vandalisme", oeuvre: o.id, titre: o.titre, lieu: l.nom, degats: Math.round(degats * 100) });
      }
    }
  }
  return faits;
}

// js/moteur/detectives.js
function detectivesDe(etat) {
  if (!etat.detectives) etat.detectives = { carnet: [], candidats: [] };
  return etat.detectives;
}
function niveauDetective(cfg, d) {
  let n = 1;
  cfg.detectives.xp.forEach((x, i) => {
    if ((d.xp || 0) >= x) n = i + 2;
  });
  return Math.min(cfg.detectives.xp.length + 1, n);
}
function chanceDetective(cfg, d) {
  const c = cfg.detectives;
  return Math.min(0.9, (c.chanceBase + c.chanceNiveau * niveauDetective(cfg, d)) * (d.efficacite ?? 1));
}
function prime(cfg, o) {
  return Math.round(niveau(cfg, o.niveau).prix * cfg.detectives.prime);
}
function chancePolice(cfg, etat, o) {
  const regisseur = effetsPersonnel(cfg, etat).regisseur?.enquete || 0;
  return Math.min(1, cfg.securite.enquete + regisseur + (o.bonusPolice || 0));
}
function tirerDetectives(cfg, etat, J) {
  const c = cfg.detectives;
  const alea = generateur(`${etat.graine}:detectives:${J}`);
  const max = Math.min(c.xp.length + 1, cfg.personnel.niveauCandidatMax[etat.statut] ?? 3);
  const liste = [];
  for (let i = 0; i < c.candidatsParSemaine; i++) {
    const n = choixPondere(Array.from({ length: max }, (_, k) => [k + 1, max - k]), alea);
    const graine = `${etat.graine}:detective:${J}-${i}`;
    const nom = `${PRENOMS[entier(PRENOMS.length, generateur(`${graine}:nom`))]} ${NOMS[entier(NOMS.length, alea)]}`;
    liste.push({ id: `d${J}-${i}`, nom, xp: n > 1 ? c.xp[n - 2] : 0, ...profil(cfg, graine), expire: J + 7 });
  }
  return liste;
}
function retrouver(cfg, etat, o, J, par) {
  o.lieu = "reserve";
  delete o.voleeLe;
  delete o.bonusPolice;
  o.usure = Math.max(o.usure || 0, cfg.usure.retrouvee);
  etat.securite.historique.push({ type: "retrouvee", jour: J, oeuvre: o.id, titre: o.titre, par: par?.nom || "police" });
  evenement(etat, J, "retrouvee", { oeuvre: o.id, titre: o.titre, par: par?.nom || null });
  for (const d of detectivesDe(etat).carnet) {
    if (d.mission?.oeuvre !== o.id) continue;
    delete d.mission;
  }
  if (par) {
    par.xp = (par.xp || 0) + 1;
    etat.primes = (etat.primes || 0) + prime(cfg, o);
  }
}
function enquetes(cfg, etat, J) {
  const s = cfg.securite;
  const c = cfg.detectives;
  const faits = [];
  const carnet = detectivesDe(etat).carnet;
  for (const o of Object.values(etat.oeuvres)) {
    if (o.lieu !== "volee") continue;
    const alea = generateur(`${etat.graine}:enquete:${o.id}:${J}`);
    const police = alea() < chancePolice(cfg, etat, o);
    delete o.bonusPolice;
    let par = null;
    if (!police) {
      for (const d of carnet.filter((x) => x.mission?.oeuvre === o.id).sort((a, b) => a.id.localeCompare(b.id))) {
        if (alea() < chanceDetective(cfg, d)) {
          par = d;
          break;
        }
      }
    }
    if (police || par) {
      retrouver(cfg, etat, o, J, par);
      faits.push({ type: "retrouvee", oeuvre: o.id, titre: o.titre, par: par?.nom || null });
      continue;
    }
    if (J - o.voleeLe >= s.enqueteSemaines * 7) {
      etat.securite.historique.push({ type: "perdue", jour: J, oeuvre: o.id, titre: o.titre, niveau: o.niveau });
      for (const d of carnet) if (d.mission?.oeuvre === o.id) delete d.mission;
      etat.pistes = (etat.pistes || []).filter((p) => p.oeuvre !== o.id);
      delete etat.oeuvres[o.id];
      evenement(etat, J, "perdue", { oeuvre: o.id, titre: o.titre });
      faits.push({ type: "perdue", oeuvre: o.id, titre: o.titre });
      continue;
    }
    if (carnet.some((d) => d.mission?.oeuvre === o.id) && alea() < c.piste.probabilite && !(etat.pistes || []).some((p) => p.oeuvre === o.id)) {
      const villes = c.piste.villes;
      const piste = {
        id: `p${o.id}-${J}`,
        oeuvre: o.id,
        jour: J,
        expire: J + c.piste.joursReponse,
        ville: villes[entier(villes.length, alea)],
        prix: Math.round(niveau(cfg, o.niveau).prix * (cfg.cote?.[etat.statut] ?? 1) * c.piste.prixPart)
      };
      etat.pistes = [...etat.pistes || [], piste];
      evenement(etat, J, "piste", { oeuvre: o.id, titre: o.titre, ville: piste.ville });
      faits.push({ type: "piste", oeuvre: o.id, titre: o.titre, ville: piste.ville });
    }
  }
  for (const d of carnet) if (d.mission && d.mission.fin <= J) delete d.mission;
  etat.pistes = (etat.pistes || []).filter((p) => p.expire > J && etat.oeuvres[p.oeuvre]?.lieu === "volee");
  return faits;
}

// js/moteur/classement.js
function prestigeJoueur(cfg, etat) {
  return Object.values(etat.oeuvres).filter((o) => o.progression >= 1 && o.lieu !== "volee").reduce((s, o) => s + prestige(cfg, o.niveau), 0);
}
function bonusPrets(cfg, etat) {
  const b = /* @__PURE__ */ new Map();
  for (const p of etat.prets?.enCours || []) {
    const v = cfg.prets.visiteursParPrestige * prestige(cfg, p.niveau) * cfg.frequentation.joursAnnee;
    b.set(p.musee, (b.get(p.musee) || 0) + v);
  }
  return b;
}
function tableau(cfg, etat, musees, annualisee, critere = "annualisee") {
  const bonus = bonusPrets(cfg, etat);
  const lignes = musees.map((m) => ({
    id: m.id,
    nom: m.nom,
    pays: m.pays,
    ville: m.ville,
    annualisee: m.visiteurs + (bonus.get(m.id) || 0),
    prestige: m.prestige || 0
  }));
  lignes.push({
    id: "joueur",
    nom: etat.nom,
    joueur: true,
    annualisee,
    prestige: prestigeJoueur(cfg, etat)
  });
  lignes.sort((a, b) => b[critere] - a[critere] || (a.joueur ? 1 : 0) - (b.joueur ? 1 : 0) || String(a.id).localeCompare(String(b.id)));
  lignes.forEach((l, i) => {
    l.rang = i + 1;
  });
  return lignes;
}
function positionJoueur(cfg, etat, musees, annualisee) {
  const principal = tableau(cfg, etat, musees, annualisee, "annualisee");
  const secondaire = tableau(cfg, etat, musees, annualisee, "prestige");
  const rang = principal.find((l) => l.joueur).rang;
  return {
    rang,
    rangPrestige: secondaire.find((l) => l.joueur).rang,
    total: principal.length,
    devant: principal.filter((l) => l.rang < rang).map((l) => l.id)
  };
}

// js/moteur/arrivages.js
function debloque(cfg, etat, drapeau) {
  return cfg.statuts.slice(0, etat.statut + 1).some((s) => s[drapeau]);
}
function supportsProposes(cfg, etat) {
  const a = cfg.arrivages;
  const tous = Object.entries(a.supports);
  if (debloque(cfg, etat, "arrivagesGraphiques")) return tous;
  return tous.filter(([s]) => a.supportsDeBase.includes(s));
}
function poidsNiveaux(cfg, etat) {
  const max = cfg.statuts[etat.statut].niveauMax;
  const liste = [];
  for (let n = 0; n <= max; n++) liste.push([n, max - n + 1]);
  return liste;
}
function idsExclus(etat) {
  const exclus = new Set(Object.keys(etat.oeuvres).map(Number));
  for (const a of etat.arrivages) for (const o of a.oeuvres) exclus.add(o.id);
  return exclus;
}
async function tirerArrivage(cfg, etat, jour, tirer2, { premier = false } = {}) {
  const alea = generateur(`${etat.graine}:arrivage:${jour}`);
  const exclus = idsExclus(etat);
  const supports = supportsProposes(cfg, etat);
  const max = cfg.statuts[etat.statut].niveauMax;
  const conservateur = effetsPersonnel(cfg, etat).conservateur;
  const nombre = premier ? cfg.depart.premierArrivage.nombre : cfg.arrivages.nombre + conservateur;
  const oeuvres = [];
  for (let i = 0; i < nombre; i++) {
    let niveau2;
    if (premier) niveau2 = cfg.depart.premierArrivage.niveau;
    else if (conservateur > 0 && i === 0) niveau2 = max;
    else niveau2 = choixPondere(poidsNiveaux(cfg, etat), alea);
    const support = choixPondere(supports, alea);
    const essais = [[niveau2, support], ...supports.filter(([s]) => s !== support).map(([s]) => [niveau2, s])];
    for (let n = niveau2 - 1; n >= 0; n--) for (const [s] of supports) essais.push([n, s]);
    for (const [n, s] of essais) {
      const graine = empreinte(`${etat.graine}:${jour}:${i}:${n}:${s}`);
      const id = await tirer2({ niveau: n, support: s, graine, exclus });
      if (id !== null && id !== void 0) {
        exclus.add(id);
        oeuvres.push({ id, niveau: n, support: s, offerte: premier && i < cfg.depart.premierArrivage.offertes });
        break;
      }
    }
  }
  return {
    id: `a${jour}`,
    jour,
    expire: jour + cfg.arrivages.validiteJours,
    oeuvres,
    premier
  };
}

// js/moteur/temps.js
var formats = /* @__PURE__ */ new Map();
function format(fuseau) {
  if (!formats.has(fuseau)) {
    formats.set(fuseau, new Intl.DateTimeFormat("en-CA", {
      timeZone: fuseau,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }));
  }
  return formats.get(fuseau);
}
function heureMurale(ms, fuseau) {
  const p = {};
  for (const { type, value } of format(fuseau).formatToParts(new Date(ms))) p[type] = value;
  return {
    annee: Number(p.year),
    mois: Number(p.month),
    jour: Number(p.day),
    heure: Number(p.hour),
    minute: Number(p.minute),
    seconde: Number(p.second)
  };
}
function jourDe(ms, temps) {
  const h = heureMurale(ms - temps.heureDebutJour * 36e5, temps.fuseau);
  return Math.round(Date.UTC(h.annee, h.mois - 1, h.jour) / 864e5);
}
function jourSemaine(jour) {
  return (jour % 7 + 7 + 4) % 7;
}

// js/moteur/journee.js
var RETENTION_HISTORIQUE = 400;
var RETENTION_RAPPORTS = 30;
function bonusReputation(cfg, etat, points) {
  etat.bonusPermanents = (etat.bonusPermanents || 0) + points;
  etat.reputation = Math.min(cfg.reputation.max, etat.reputation + points);
}
function ramener(cfg, etat, id, jour) {
  const o = etat.oeuvres[id];
  if (!o) return;
  const r = o.retour || { lieu: "reserve" };
  delete o.retour;
  if (r.lieu === "espace" && espace(etat, r.espace) && contenuEspace(etat, r.espace)[r.place] === null && !refusAccrochage(cfg, etat, o, r.espace)) {
    o.lieu = "espace";
    o.espace = r.espace;
    o.place = r.place;
    return;
  }
  delete o.espace;
  delete o.place;
  o.lieu = r.lieu === "privee" ? "privee" : "reserve";
  sortirDuPublic(o, jour);
}
function fermerJour(cfg, etat, d, ctx) {
  const detail = detailVisiteurs(cfg, etat, d);
  const visiteurs = detail.total;
  const expo = etat.expositions?.courante;
  if (expo && d >= expo.debut && d < expo.fin) {
    expo.visiteurs += detail.parOeuvre.filter((a) => a.espace === "exposition").reduce((s, a) => s + a.visiteurs, 0);
  }
  const { ouverts } = espacesOuverts(cfg, etat, d);
  for (const o of Object.values(etat.oeuvres)) {
    if (o.lieu === "espace" && ouverts.has(o.espace) || o.lieu === "exposition" && ouverts.has("exposition")) {
      o.joursExpo = (o.joursExpo || 0) + 1;
      user(cfg, o);
    }
  }
  const sat = satisfaction(cfg, etat, visiteurs);
  etat.satisfaction = sat;
  etat.reputation = reputationSuivante(cfg, etat, sat);
  etat.historique.push({ jour: d, visiteurs, satisfaction: round1(sat), reputation: round1(etat.reputation) });
  if (etat.historique.length > RETENTION_HISTORIQUE) {
    etat.historique = etat.historique.slice(-RETENTION_HISTORIQUE);
  }
  const annualisee = frequentationAnnualisee(cfg, etat.historique);
  etat.historique[etat.historique.length - 1].annualisee = annualisee;
  const atteint = statutAtteint(cfg, annualisee);
  while (etat.statut < atteint) {
    etat.statut++;
    bonusReputation(cfg, etat, cfg.reputation.bonusStatut);
    evenement(etat, d + 1, "statut", { statut: etat.statut });
  }
  if (ctx?.musees?.length) {
    const avant = etat.classement;
    const pos = positionJoueur(cfg, etat, ctx.musees, annualisee);
    if (avant) {
      const avantDevant = new Set(avant.devant);
      const apresDevant = new Set(pos.devant);
      const gagnes = avant.devant.filter((id) => !apresDevant.has(id));
      const perdus = pos.devant.filter((id) => !avantDevant.has(id));
      if (gagnes.length || perdus.length) {
        const nom = (id) => ctx.musees.find((m) => m.id === id)?.nom || "?";
        evenement(etat, d + 1, "classement", {
          rang: pos.rang,
          avant: avant.rang,
          gagnes: gagnes.slice(0, 5).map(nom),
          perdus: perdus.slice(0, 5).map(nom)
        });
      }
    }
    etat.classement = { jour: d, annualisee, ...pos, precedent: avant?.rang ?? null };
  }
  etat.jourFerme = d;
}
async function ouvrirJour(cfg, etat, J, ctx) {
  const veille = etat.historique[etat.historique.length - 1] || null;
  const rapport = {
    jour: J,
    vu: false,
    veille,
    rang: etat.classement?.rang ?? null,
    rangPrecedent: etat.classement?.precedent ?? null,
    statut: etat.statut,
    faits: []
  };
  for (const e of etat.evenements) {
    if (e.jour === J && (e.type === "statut" || e.type === "classement" || e.type === "promotion")) rapport.faits.push({ ...e });
  }
  rapport.faits.push(...finirTravaux(cfg, etat, J, ramener));
  const restants = [];
  for (const p of etat.prets.enCours) {
    if (p.fin > J) {
      restants.push(p);
      continue;
    }
    const o = etat.oeuvres[p.oeuvre];
    ramener(cfg, etat, p.oeuvre, J);
    if (o) {
      o.joursExpo = joursPourNouveaute(cfg, cfg.prets.nouveauteRetour);
      if (o.lieu === "espace") o.sortieLe = null;
    }
    etat.prets.historique.push({ ...p, rendu: J });
    rapport.faits.push({ type: "finPret", oeuvre: p.oeuvre, musee: p.museeNom, lieu: o?.lieu });
  }
  etat.prets.enCours = restants;
  const d = etat.prets.demande;
  if (d && d.expire <= J) {
    etat.prets.historique.push({ ...d, issue: "expiree" });
    etat.prets.demande = null;
    rapport.faits.push({ type: "pretExpire", oeuvre: d.oeuvre, musee: d.museeNom });
  }
  const x = etat.expositions.courante;
  if (x && x.fin <= J) {
    const bonus = Math.min(cfg.expositions.reputationMax, x.visiteurs / cfg.expositions.visiteursParPointReputation);
    bonusReputation(cfg, etat, bonus);
    for (const id of x.oeuvres) ramener(cfg, etat, id, J);
    etat.expositions.historique.push({
      id: x.id,
      theme: x.theme,
      debut: x.debut,
      fin: x.fin,
      visiteurs: Math.round(x.visiteurs),
      bonus: round1(bonus),
      oeuvres: x.oeuvres.length,
      emprunts: x.emprunts.length
    });
    etat.expositions.derniereFin = J;
    etat.expositions.courante = null;
    evenement(etat, J, "exposition", { visiteurs: Math.round(x.visiteurs), bonus: round1(bonus) });
    rapport.faits.push({ type: "finExposition", visiteurs: Math.round(x.visiteurs), bonus: round1(bonus), theme: x.theme });
  }
  etat.arrivages = etat.arrivages.filter((a) => a.expire > J);
  if (jourSemaine(J) === cfg.arrivages.jourSemaine && ctx?.tirer && !etat.arrivages.some((a) => a.jour === J)) {
    const a = await tirerArrivage(cfg, etat, J, ctx.tirer);
    if (a.oeuvres.length) {
      etat.arrivages.push(a);
      evenement(etat, J, "arrivage", { arrivage: a.id, nombre: a.oeuvres.length });
      rapport.faits.push({ type: "arrivage", arrivage: a.id, nombre: a.oeuvres.length });
    }
  }
  if (cfg.detectives && jourSemaine(J) === cfg.arrivages.jourSemaine) {
    const d2 = detectivesDe(etat);
    if (!d2.candidats.some((c) => c.id.startsWith(`d${J}-`))) d2.candidats = tirerDetectives(cfg, etat, J);
  }
  if (etat.personnel) {
    etat.personnel.candidats = etat.personnel.candidats.filter((c) => c.expire > J);
    if (jourSemaine(J) === cfg.arrivages.jourSemaine && !etat.personnel.candidats.some((c) => c.id.startsWith(`c${J}-`))) {
      const nouveaux = tirerCandidats(cfg, etat, J);
      etat.personnel.candidats.push(...nouveaux);
      rapport.faits.push({ type: "candidats", nombre: nouveaux.length });
    }
  }
  if (etat.securite) {
    if (jourSemaine(J) === cfg.securite.jourSemaine) rapport.faits.push(...enquetes(cfg, etat, J));
    rapport.faits.push(...tirages(cfg, etat, J));
  }
  const alerte = Math.ceil(cfg.arrivages.alerteExpirationH / 24);
  for (const a of etat.arrivages) {
    if (a.expire - J === alerte && a.oeuvres.some((o) => !o.achetee)) {
      evenement(etat, J, "expiration", { arrivage: a.id });
    }
  }
  if (debloque(cfg, etat, "prets")) {
    if (jourSemaine(J) === cfg.arrivages.jourSemaine) {
      const alea = generateur(`${etat.graine}:semainePret:${J}`);
      const p = cfg.prets.probabiliteHebdo + (effetsPersonnel(cfg, etat).regisseur?.probabilitePret || 0);
      etat.prets.prevue = alea() < p ? J + entier(7, alea) : null;
    }
    if (etat.prets.prevue === J && !etat.prets.demande) {
      const demande = demandePret(cfg, etat, J, ctx);
      if (demande) {
        etat.prets.demande = demande;
        evenement(etat, J, "pret", { oeuvre: demande.oeuvre, musee: demande.museeNom });
        rapport.faits.push({ type: "demandePret", oeuvre: demande.oeuvre, musee: demande.museeNom });
      }
      etat.prets.prevue = null;
    }
  }
  etat.rapports.push(rapport);
  if (etat.rapports.length > RETENTION_RAPPORTS) etat.rapports = etat.rapports.slice(-RETENTION_RAPPORTS);
}
function demandePret(cfg, etat, J, ctx) {
  const eligibles = Object.values(etat.oeuvres).filter((o) => o.lieu === "espace");
  if (!eligibles.length || !ctx?.musees?.length) return null;
  const alea = generateur(`${etat.graine}:demande:${J}`);
  const oeuvre = choixPondere(eligibles.map((o) => [o, prestige(cfg, o.niveau)]), alea);
  const annualisee = etat.classement?.annualisee ?? frequentationAnnualisee(cfg, etat.historique);
  const lignes = tableau(cfg, etat, ctx.musees, annualisee);
  const iJ = lignes.findIndex((l) => l.joueur);
  const candidats = lignes.filter((l, i) => !l.joueur && Math.abs(i - iJ) <= cfg.prets.ecartRangs);
  if (!candidats.length) return null;
  const musee = candidats[entier(candidats.length, alea)];
  const duree = cfg.prets.durees[entier(cfg.prets.durees.length, alea)];
  return {
    id: `p${J}`,
    jour: J,
    expire: J + Math.ceil(cfg.prets.reponseH / 24),
    musee: musee.id,
    museeNom: musee.nom,
    oeuvre: oeuvre.id,
    niveau: oeuvre.niveau,
    duree,
    remuneration: Math.round(cfg.prets.remunerationHebdo * niveau(cfg, oeuvre.niveau).prix * duree / 7 * (1 + (effetsPersonnel(cfg, etat).regisseur?.remuneration || 0)))
  };
}
async function avancer(cfg, etat0, jourCourant, ctx) {
  const etat = copie(etat0);
  while (etat.jourFerme < jourCourant - 1) {
    const d = etat.jourFerme + 1;
    fermerJour(cfg, etat, d, ctx);
    await ouvrirJour(cfg, etat, d + 1, ctx);
  }
  return etat;
}
function round1(x) {
  return Math.round(x * 10) / 10;
}

// supabase/source/webpush.js
var enc = new TextEncoder();
function b64(octets2) {
  let s = "";
  for (const o of new Uint8Array(octets2)) s += String.fromCharCode(o);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function octets(b64url) {
  const p = "=".repeat((4 - b64url.length % 4) % 4);
  const brut = atob((b64url + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(brut, (c) => c.charCodeAt(0));
}
function concat(...parties) {
  const n = parties.reduce((s, p) => s + p.length, 0);
  const r = new Uint8Array(n);
  let i = 0;
  for (const p of parties) {
    r.set(p, i);
    i += p.length;
  }
  return r;
}
async function hmac(cle, donnees) {
  const k = await crypto.subtle.importKey("raw", cle, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, donnees));
}
async function hkdf(sel, ikm, info, longueur) {
  const prk = await hmac(sel, ikm);
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, longueur);
}
function jwkPrivee(publique, d, usage) {
  return {
    kty: "EC",
    crv: "P-256",
    d: typeof d === "string" ? d : b64(d),
    x: b64(publique.slice(1, 33)),
    y: b64(publique.slice(33, 65)),
    ext: true,
    key_ops: usage
  };
}
async function chiffrer(message, { p256dh, auth }, essai = null) {
  const uaPublique = octets(p256dh);
  const secretAuth = octets(auth);
  let asPublique;
  let asPrivee;
  if (essai) {
    asPublique = octets(essai.asPublique);
    asPrivee = await crypto.subtle.importKey("jwk", jwkPrivee(asPublique, essai.asPrivee, ["deriveBits"]), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  } else {
    const paire = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    asPrivee = paire.privateKey;
    asPublique = new Uint8Array(await crypto.subtle.exportKey("raw", paire.publicKey));
  }
  const sel = essai ? octets(essai.sel) : crypto.getRandomValues(new Uint8Array(16));
  const ua = await crypto.subtle.importKey("raw", uaPublique, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const secretEcdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: ua }, asPrivee, 256));
  const infoCle = concat(enc.encode("WebPush: info\0"), uaPublique, asPublique);
  const ikm = await hkdf(secretAuth, secretEcdh, infoCle, 32);
  const cek = await hkdf(sel, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sel, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const clair = concat(typeof message === "string" ? enc.encode(message) : message, new Uint8Array([2]));
  const cle = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cle, clair));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return concat(sel, rs, new Uint8Array([asPublique.length]), asPublique, chiffre);
}
async function vapid(endpoint, { publique, privee, sujet }, maintenant = Date.now()) {
  const aud = new URL(endpoint).origin;
  const entete = b64(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corps = b64(enc.encode(JSON.stringify({ aud, exp: Math.floor(maintenant / 1e3) + 12 * 3600, sub: sujet })));
  const pub = octets(publique);
  const cle = await crypto.subtle.importKey("jwk", jwkPrivee(pub, privee, ["sign"]), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cle, enc.encode(`${entete}.${corps}`));
  return `vapid t=${entete}.${corps}.${b64(signature)}, k=${publique}`;
}
async function envoyer(abonnement, charge, cles, { ttl = 86400, fetch: f = fetch } = {}) {
  const corps = await chiffrer(JSON.stringify(charge), abonnement);
  const r = await f(abonnement.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapid(abonnement.endpoint, cles),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: "normal"
    },
    body: corps
  });
  return r.status;
}

// supabase/source/musee.js
var env = (k) => globalThis.Deno?.env.get(k) ?? globalThis.process?.env?.[k];
var URL_SB = env("SUPABASE_URL");
var CLE_SERVICE = env("SUPABASE_SERVICE_ROLE_KEY");
var URL_CATALOGUE = env("MUSEE_URL_CATALOGUE") || "https://blinytz.github.io/musee/catalogue/";
var VAPID = {
  publique: env("MUSEE_VAPID_PUBLIQUE") || env("VAPID_PUBLIC"),
  privee: env("MUSEE_VAPID_PRIVEE") || env("VAPID_PRIVATE"),
  sujet: "https://blinytz.github.io/musee/"
};
async function rest(chemin, { methode = "GET", corps, preferer } = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/${chemin}`, {
    method: methode,
    headers: {
      apikey: CLE_SERVICE,
      Authorization: `Bearer ${CLE_SERVICE}`,
      "Content-Type": "application/json",
      ...preferer ? { Prefer: preferer } : {}
    },
    body: corps === void 0 ? void 0 : JSON.stringify(corps)
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${chemin} : ${r.status} ${texte.slice(0, 200)}`);
  return texte ? JSON.parse(texte) : null;
}
var cleCron = env("MUSEE_CLE_CRON") || null;
async function cleAttendue() {
  if (!cleCron) cleCron = await rest("rpc/musee_cle_cron", { methode: "POST", corps: {} }).catch(() => null);
  return cleCron;
}
function tirer({ niveau: niveau2, support, graine, exclus }) {
  return rest("rpc/musee_tirer", {
    methode: "POST",
    corps: { p_niveau: niveau2, p_support: support, p_graine: graine, p_exclus: [...exclus] }
  });
}
var MESSAGES = {
  arrivage: (e) => ({ titre: "Nouvel arrivage", texte: `${e.nombre} \u0153uvres \xE0 d\xE9couvrir`, route: "arrivages" }),
  expiration: () => ({ titre: "Arrivage", texte: "Expire dans 24 h", route: "arrivages" }),
  pret: (e) => ({ titre: "Demande de pr\xEAt", texte: e.musee || "", route: "expositions" }),
  classement: (e) => ({
    titre: `${e.rang}e au classement`,
    texte: e.rang < e.avant ? `Devant ${(e.gagnes || []).join(", ")}` : `Derri\xE8re ${(e.perdus || []).join(", ")}`,
    route: "classement"
  }),
  statut: (e, cfg) => ({ titre: "Nouveau statut", texte: cfg.statuts[e.statut]?.nom || "", route: "musee" }),
  exposition: (e) => ({ titre: "Exposition termin\xE9e", texte: `${Number(e.visiteurs || 0).toLocaleString("fr-FR")} visiteurs`, route: "expositions" }),
  cambriolage: (e) => ({ titre: "Cambriolage", texte: e.titre || "", route: "securite" }),
  volSalle: (e) => ({ titre: "Vol en salle", texte: e.titre || "", route: "securite" }),
  vandalisme: (e) => ({ titre: "Vandalisme", texte: `${e.titre || ""} ab\xEEm\xE9e de ${e.degats} points`, route: "securite" }),
  retrouvee: (e) => ({ titre: "\u0152uvre retrouv\xE9e", texte: e.titre || "", route: "securite" }),
  perdue: (e) => ({ titre: "\u0152uvre perdue", texte: e.titre || "", route: "securite" }),
  promotion: (e) => ({ titre: "Personnel", texte: `${e.nom} passe niveau ${e.niveau}`, route: "personnel" })
};
var REGLAGE = { volSalle: "cambriolage", vandalisme: "cambriolage", retrouvee: "cambriolage", perdue: "cambriolage", promotion: "personnel" };
async function notifier(userId, messages) {
  if (!messages.length || !VAPID.publique || !VAPID.privee) return 0;
  const abonnements = await rest(`musee_abonnements?select=endpoint,p256dh,auth&user_id=eq.${userId}`);
  let envoyes = 0;
  for (const a of abonnements) {
    for (const m of messages) {
      try {
        const statut = await envoyer(a, m, VAPID);
        if (statut === 404 || statut === 410) {
          await rest(`musee_abonnements?endpoint=eq.${encodeURIComponent(a.endpoint)}`, { methode: "DELETE" });
          break;
        }
        if (statut < 300) envoyes++;
      } catch (e) {
        console.warn("Envoi impossible", e.message);
      }
    }
  }
  return envoyes;
}
async function quotidien() {
  const lignes = await rest("musee_etats?select=user_id,etat,version");
  const musees = await fetch(`${URL_CATALOGUE}musees.json`).then((r) => r.json()).catch(() => []);
  const bilan = [];
  for (const ligne of lignes) {
    try {
      const etat = migrer(ligne.etat, CONFIG);
      const cfg = configEffective(etat.reglages?.parametres);
      const jour = jourDe(Date.now(), cfg.temps);
      let nouvel = etat.jourFerme < jour - 1 ? await avancer(cfg, etat, jour, { musees, tirer }) : copie(etat);
      const recents = nouvel.evenements.filter((e) => !e.notifie && e.jour >= jour - 1);
      const aMarquer = nouvel.evenements.some((e) => !e.notifie);
      if (nouvel.jourFerme === etat.jourFerme && !aMarquer) {
        bilan.push({ ok: "rien" });
        continue;
      }
      nouvel.evenements.forEach((e) => {
        e.notifie = true;
      });
      const ecrit = await rest(`musee_etats?user_id=eq.${ligne.user_id}&version=eq.${ligne.version}&select=version`, {
        methode: "PATCH",
        corps: { etat: nouvel, version: ligne.version + 1, jour_ferme: nouvel.jourFerme, maj: (/* @__PURE__ */ new Date()).toISOString() },
        preferer: "return=representation"
      });
      if (!ecrit?.length) {
        bilan.push({ conflit: true });
        continue;
      }
      const voulues = nouvel.reglages?.notifications || {};
      const messages = recents.filter((e) => voulues[REGLAGE[e.type] || e.type] !== false && MESSAGES[e.type]).map((e) => ({ ...MESSAGES[e.type](e, cfg), tag: `musee-${e.type}` }));
      const envoyes = await notifier(ligne.user_id, messages);
      bilan.push({ jours: nouvel.jourFerme - etat.jourFerme, notifications: envoyes });
    } catch (e) {
      console.error("Mus\xE9e en erreur", ligne.user_id, e);
      bilan.push({ erreur: e.message });
    }
  }
  return bilan;
}
async function sessions() {
  const maintenant = (/* @__PURE__ */ new Date()).toISOString();
  const dues = await rest(`musee_sessions?select=id,user_id,titre,duree_min&notifiee=is.false&arretee_a=is.null&fin_prevue=lte.${maintenant}`);
  if (!dues.length) return [];
  await rest(`musee_sessions?id=in.(${dues.map((s) => s.id).join(",")})`, { methode: "PATCH", corps: { notifiee: true } });
  const reglages = /* @__PURE__ */ new Map();
  for (const s of dues) {
    if (!reglages.has(s.user_id)) {
      const l = await rest(`musee_etats?select=etat->reglages&user_id=eq.${s.user_id}`);
      reglages.set(s.user_id, l?.[0]?.reglages || {});
    }
    if (reglages.get(s.user_id).notifications?.session === false) continue;
    const heures = Math.floor(s.duree_min / 60);
    const minutes = s.duree_min % 60;
    const duree = heures ? `${heures} h${minutes ? ` ${String(minutes).padStart(2, "0")}` : ""}` : `${minutes} min`;
    await notifier(s.user_id, [{ titre: "Session termin\xE9e", texte: s.titre ? `${s.titre} \xB7 ${duree}` : duree, route: "atelier", tag: "musee-session" }]);
  }
  return dues.map((s) => s.id);
}
async function traiter(requete) {
  const cle = await cleAttendue();
  if (!cle || requete.headers.get("x-musee-cle") !== cle) {
    return new Response("Refus\xE9", { status: 401 });
  }
  const { type } = await requete.json().catch(() => ({}));
  try {
    const r = type === "sessions" ? await sessions() : await quotidien();
    return Response.json({ type, r });
  } catch (e) {
    console.error(e);
    return Response.json({ erreur: e.message }, { status: 500 });
  }
}
globalThis.Deno?.serve(traiter);
export {
  traiter
};
