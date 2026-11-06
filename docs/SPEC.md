# Musée : spec complète

Nouvelle PWA « Musée » : vanilla HTML/CSS/JS, GitHub Pages, Chrome Android en
priorité. Raccordée à la Centrale du Supabase Éclats comme Pronos et Cagnottes.
Aucune valeur en dur : tous les paramètres dans la config et un écran Réglages.
Fuseau Europe/Paris, jour de jeu à 4 h.

## 0. Boucle de jeu
On acquiert des œuvres très abîmées avec des éclats, on les restaure uniquement
par des sessions de concentration, on les expose pour attirer des visiteurs.
Les visiteurs font monter la réputation, le statut et le classement mondial, et
rapportent des éclats uniquement pendant les sessions. On réinvestit dans le
bâtiment, ce qui débloque des œuvres plus prestigieuses. Aucun coût récurrent.

## 1. Démarrage
- Au premier lancement, le joueur nomme son musée (modifiable).
- Départ : 1 aile, 2 salles de 6 places, réserve de 10, collection privée de 3,
  1 emplacement d'atelier, réputation 50, prix du billet 1 éclat.
- Premier arrivage immédiat : 5 œuvres Mineures, la première offerte.

## 2. Catalogue
- Supports : peinture, sculpture, photographie, estampe.
- Contenu :
  - toutes les œuvres de ces supports qui ont une page Wikipédia (fr ou en),
    toutes époques, y compris les œuvres protégées
  - les œuvres des API ouvertes sans page Wikipédia, si leur artiste en a une
- Métadonnées : Wikidata (titre fr/en, auteur, date, mouvement, support, pays,
  collection de conservation, dimensions).
- Image par défaut, par ordre de priorité : Rijksmuseum, Metropolitan Museum,
  Art Institute of Chicago, National Gallery of Art (API ouvertes, haute
  définition), puis Wikimedia Commons, puis l'image principale de la page
  Wikipédia en anglais. Les images sont chargées à la volée, jamais stockées
  dans le repo. La résolution de chaque image est enregistrée.
- Notoriété : pages vues Wikipédia sur 12 mois (toutes langues), tirées des
  dumps mensuels de Wikimedia (pas de l'API page par page). Œuvre sans page :
  1 % des pages vues de son artiste.
- Niveaux : les percentiles sont calculés sur les seules œuvres ayant une page
  Wikipédia. Trésor top 0,5 %, Chef-d'œuvre 0,5 à 2 %, Majeure 2 à 6 %,
  Remarquable 6 à 15 %, Notable 15 à 35 %, Mineure le reste. Les œuvres sans
  page sont classées Mineure ou Notable selon le seuil de notoriété Notable.
- Stockage : le catalogue complet est publié en fichiers JSON statiques sur
  GitHub Pages, découpés par tranches. Supabase (projet gratuit partagé avec
  l'écosystème) ne stocke que l'id, le niveau, le prestige et le musée de
  conservation de chaque œuvre, plus l'état du joueur.
- Catalogue construit et mis à jour chaque mois par une GitHub Action, sans IA.
  Un id d'œuvre ne change jamais. Le niveau peut changer à la mise à jour (le
  travail déjà fait est conservé en pourcentage).
- Image personnalisée : depuis la fiche d'une œuvre, le joueur remplace
  l'image par un fichier de son choix, stocké dans un bucket privé Supabase
  (URL signées). Retour à l'image par défaut possible à tout moment. La
  restauration s'applique de la même façon, quelle que soit l'image.

## 3. Niveaux des œuvres
| Niveau | Travail | Prestige | Maîtrise requise | Prix d'arrivage |
|---|---|---|---|---|
| Mineure | 2 h | 1 | 1 | 50 |
| Notable | 5 h | 3 | 2 | 210 |
| Remarquable | 12 h | 8 | 4 | 750 |
| Majeure | 30 h | 20 | 6 | 2 450 |
| Chef-d'œuvre | 60 h | 50 | 8 | 8 000 |
| Trésor | 120 h | 150 | 10 | 34 000 |
Prix d'arrivage = arrondi(50 × prestige^1,3).

## 4. Sessions de concentration
- Durée réglable de 10 min à 7 h, à la minute près.
- Au lancement, le joueur choisit une œuvre de l'atelier (sa maîtrise du
  support doit atteindre le niveau requis). Une seule session à la fois.
- Aucune interruption : la session repose sur l'horodatage de début enregistré
  côté serveur. Quitter l'app ou verrouiller l'écran ne fait rien perdre. La
  session se termine seule à l'heure prévue, avec une notification.
- Arrêt anticipé possible : le temps écoulé compte s'il atteint 10 min.
- Session libre (ajout du 6 novembre 2026) : pas de durée choisie, le chrono
  monte ; pause et reprise à volonté, la session se termine quand le joueur le
  décide. Seul le temps hors pause compte, borné à 7 h : la session se met
  alors en pause d'elle-même (notifiée) et attend d'être validée. À la
  validation, le joueur peut réduire le temps compté (une pause oubliée),
  jamais l'augmenter ; les minutes retirées restent dans l'historique. Rien
  n'est versé ni prélevé à la pause : tout se règle à la fin, aux taux figés
  au lancement. Chaque période de travail est une tranche dont
  le serveur note le début et la fin (`musee_session_demarrer` et
  `musee_session_arreter`, sans changement de schéma) ; l'identifiant d'une
  tranche dérive de celui de la session, pour qu'une reprise rejouée après une
  coupure retrouve la même.
- Travail effectif = durée × (1 + 0,25 × durée / 420) × (1 + bonus de maîtrise
  + bonus d'équipement de l'atelier).
- Le surplus de travail au-delà de 100 % est perdu (affiché en fin de session).
- Gains en éclats : voir section 10.
- Fin de session : écran avant/après avec curseur de comparaison, pourcentage
  gagné, étape en cours, éclats gagnés, progression de maîtrise.
- Historique des sessions : date, durée, œuvre, travail, éclats.

## 5. Rendu de la restauration
L'œuvre de départ est méconnaissable. Une toile qui a vécu, rendue en canvas
sur l'image réelle : encrassement qui brouille la lecture, vernis oxydé,
crasse et taches, craquelures fines, lacunes laissant voir l'enduit, grain de
surface. Chaque étape efface sa couche ; paramètres continus dans l'étape
(`rendu` dans `js/config.js`).

| Progression | Étape | Évolution |
|---|---|---|
| 0 à 10 % | Consolidation | Les écailles se refixent : le liseré sombre des lacunes s'efface, les craquelures reculent. |
| 10 à 30 % | Nettoyage | La crasse et son voile brun disparaissent, l'image commence à se lire. |
| 30 à 55 % | Dévernissage | Le vernis ambré s'allège : couleurs et netteté reviennent. |
| 55 à 80 % | Réintégration | Les lacunes se comblent. |
| 80 à 100 % | Vernis | Dernières craquelures, grain et flou résiduel : pleine définition. |

- Pendant une session, une fenêtre de nettoyage part d'un point de la toile
  et la gagne au fil du temps, en découvrant l'état qu'elle aura à la fin.
- Motif des craquelures, crasse et ordre de comblement générés à partir d'une
  graine propre à chaque œuvre : rendu stable d'une ouverture à l'autre.
- L'œuvre ne doit être reconnaissable qu'autour de 25 à 35 %.
- Dégradations par support :
  - peinture : vernis jauni, craquelures, écailles
  - sculpture : encrassement noir, fragments manquants
  - photographie : voile argenté, décoloration, taches
  - estampe : papier jauni, rousseurs, déchirures
- Une œuvre restaurée s'affiche en pleine définition, avec un mode
  « inspection » (zoom libre). Le zoom maximal est limité par la résolution de
  l'image pour ne jamais afficher de pixels.

## 6. Atelier et rangement
- Emplacements d'atelier : 1 (galerie), 2 (municipal), 3 (national), 4 (universel).
- Les œuvres de l'atelier ne se dégradent jamais.
- Une œuvre acquise va en réserve. On la place dans l'atelier pour la
  restaurer. Une œuvre restaurée va, au choix du joueur, en salle publique,
  en collection privée ou en réserve. Une œuvre n'est exposable qu'à 100 %.
- Réserve pleine : impossible d'acquérir.
- Une œuvre a toujours un seul emplacement : réserve, atelier, salle publique,
  collection privée, prêt ou exposition temporaire.

## 7. Maîtrise du restaurateur
Une maîtrise par support. Elle monte avec les heures réelles de session passées
sur ce support.
| Niveau | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Heures | 0 | 5 | 15 | 35 | 70 | 120 | 200 | 300 | 450 | 650 |
| Bonus | 0 | 3 % | 6 % | 9 % | 12 % | 15 % | 18 % | 21 % | 24 % | 27 % |

## 8. Visiteurs
Visiteurs par jour = Σ (10 × prestige × nouveauté × cohérence × bonus d'espace)
sur les œuvres en salle publique et en exposition temporaire,
× (0,5 + réputation / 100) × facteur prix × effet des campagnes en cours.

- Nouveauté : de ×2 à ×1 en 30 jours d'exposition (linéaire), ×1 jusqu'à
  180 jours, puis -0,05 tous les 30 jours, plancher ×0,7. Une œuvre retirée
  des salles pendant au moins 30 jours repart de ×2.
- Thème de salle (facultatif) : mouvement, artiste, pays, siècle ou support.
  Œuvre conforme ×1,25, non conforme ×0,8. Salle sans thème : ×1.
- Facteur prix = exp(-(prix - 1) / prix optimal), prix optimal = 1 + réputation / 20.
  Le prix est un entier, 0 compris (journée gratuite : plus de visiteurs, aucun gain).
- Les visiteurs sont simulés chaque jour (Edge Function + pg_cron à 4 h, avec
  rattrapage si besoin). Ils alimentent statut, réputation, classement et
  rapport quotidien, mais ne rapportent rien hors session.

## 9. Satisfaction et réputation
- Satisfaction (0 à 100) = 60 + équipements et personnel + 10 × part des
  salles thématiques cohérentes (au moins 80 % d'œuvres conformes) - pénalité
  d'affluence. Pénalité = (densité / 150 - 1) × 20 si densité > 150, plafond
  40, densité = visiteurs par jour / places publiques.
- Réputation (0 à 100), départ 50. Chaque jour : réputation += 5 % × (cible -
  réputation), cible = satisfaction + bonus permanents (plafond 100).
- Bonus permanents : passage de statut +5, exposition temporaire réussie
  jusqu'à +15, prêt accepté +1.

## 10. Économie
- Éclats gagnés uniquement pendant les sessions. Une heure de session
  rapporte la part d'une journée de recettes :
  gain = visiteurs par jour × prix du billet × part du statut × bonus de
  revenus × durée en heures (arrondi à l'entier inférieur).
- Crédit sur la Centrale en fin de session.
- Toutes les dépenses sont ponctuelles et débitées sur la Centrale.

## 11. Statut
Fréquentation annualisée = moyenne des visiteurs des 7 derniers jours × 365.
Un statut atteint est acquis définitivement.
| Statut | Fréquentation annualisée | Part des recettes | Débloque |
|---|---|---|---|
| Galerie de quartier | départ | 5 % | Mineures, Notables |
| Musée municipal | 20 000 | 10 % | Remarquables, 2e emplacement d'atelier |
| Musée régional | 150 000 | 15 % | prêts, estampes et photographies dans les arrivages, cabinet d'arts graphiques, boutique, audioguides, conservateur |
| Musée national | 1 000 000 | 25 % | Majeures, 3e emplacement d'atelier, jardin de sculptures, salle d'exposition temporaire, partenariat presse |
| Musée international | 3 000 000 | 35 % | Chefs-d'œuvre, sécurité niveau 1 |
| Musée universel | 6 000 000 | 50 % | Trésors, 4e emplacement d'atelier, sécurité niveau 2 |
Chaque passage de statut est mis en scène (nouvelle façade, annonce des déblocages).

## 12. Investissements (paiement unique, effet permanent)
Bâtiment :
- Aile : 2e aile 5 000, puis ×2,5 (12 500, 31 250…). Maximum 6 ailes.
  Une aile contient jusqu'à 4 salles.
- Salle (6 places) : 500 × 1,35^n, n = salles déjà achetées (les 2 de départ
  sont offertes).
- Agrandir une salle de 3 places (maximum 15) : 400, 1 200, 3 600.
- Réserve +10 places : 200 × 2^n.
- Collection privée +3 places : 300 × 2^n.

Espaces :
- Cabinet d'arts graphiques (régional) : 8 000. Salle de 8 places, seul
  espace public où estampes et photographies sont exposables. Agrandissable.
- Jardin de sculptures (national) : 20 000. 8 places réservées aux
  sculptures, attrait ×1,2.
- Salle d'exposition temporaire (national) : 30 000. 15 places.

Équipements :
- Café : 2 000, revenus ×1,1, satisfaction +3
- Boutique (régional) : 5 000, revenus ×1,2
- Audioguides (régional) : 10 000, satisfaction +10

Atelier :
- Loupe binoculaire : 1 000, efficacité +5 %
- Salle climatisée : 10 000, efficacité +5 %
- Laboratoire d'imagerie : 50 000, efficacité +10 %

Documentation :
- Bibliothèque : 3 000. Les arrivages révèlent mouvement et artiste. Prix -10 %.
- Archives : 25 000 (après la bibliothèque). Les arrivages révèlent le titre.
  Prix -20 % au total.

Personnel :
- Médiateurs : 8 000, satisfaction +10
- Conservateur (régional) : 15 000. Arrivages de 6 œuvres, dont 1 du plus
  haut niveau accessible garantie.
- Sécurité niveau 1 (international) : 40 000, requis pour exposer les Chefs-d'œuvre
- Sécurité niveau 2 (universel) : 150 000, requis pour exposer les Trésors

Communication (renouvelable, une campagne à la fois, 30 jours entre deux) :
- Campagne d'affichage : 3 × visiteurs par jour actuels. Visiteurs ×1,5 pendant 7 jours.
- Partenariat presse (national) : 5 × visiteurs par jour actuels. Visiteurs ×2
  pendant 3 jours.

## 13. Arrivages
- Chaque lundi à 4 h : 5 œuvres (6 avec le conservateur), valables 7 jours.
- Niveaux limités par le statut. Pondération : niveau le plus haut accessible
  poids 1, le précédent poids 2, puis 3, etc.
- Supports : peinture 60 %, sculpture 15 %, estampe 15 %, photographie 10 %
  (estampes et photographies à partir du statut régional, sinon peinture et
  sculpture uniquement).
- Une œuvre déjà possédée n'est jamais proposée. Une œuvre non achetée peut
  revenir plus tard.
- Affichage : image dégradée à 0 %, support, niveau, siècle. Bibliothèque :
  + mouvement et artiste. Archives : + titre.
- Prix d'arrivage (section 3), réductions de documentation comprises.

## 14. Prêts
- À partir du statut régional, au plus une demande par semaine.
- Demandeur : un musée du classement situé entre 10 rangs au-dessus et 10 rangs
  en dessous. Œuvre demandée : une œuvre de salle publique, tirée au prorata
  de son prestige. Une œuvre en atelier, en réserve, en collection privée, en
  exposition temporaire ou déjà prêtée ne peut pas être demandée.
- Durée 7, 14 ou 21 jours. Rémunération = 30 % du prix d'arrivage par semaine
  de prêt. Sans réponse sous 48 h, la demande expire.
- Si le joueur accepte : l'œuvre quitte sa salle, la rémunération est
  créditée, réputation +1, et le musée emprunteur gagne 15 × prestige
  visiteurs par jour pendant le prêt (fréquentation annualisée en
  conséquence), ce qui peut le faire passer devant au classement. L'œuvre
  revient ensuite dans sa salle avec une nouveauté de ×1,5 (en réserve si sa
  place a été prise).
- Une œuvre prêtée ne peut ni être placée en atelier, ni entrer dans une
  exposition temporaire.

## 15. Expositions temporaires (statut national et salle dédiée)
- Thème choisi par le joueur : artiste, mouvement, pays, siècle ou support.
- 6 à 15 œuvres, toutes conformes au thème : œuvres du joueur (elles
  quittent leur salle pendant l'exposition) et emprunts.
- Emprunts : œuvres du catalogue conservées par des musées classés au plus
  30 rangs au-dessus du joueur. Coût = 50 % du prix d'arrivage. Au plus la
  moitié des œuvres de l'exposition. Les œuvres empruntées s'affichent
  restaurées.
- Durée 21 jours. Attrait des œuvres de l'exposition ×2, cohérence ×1,5.
- Bilan : réputation + (visiteurs de l'exposition / 10 000), plafond +15.
  Les œuvres du joueur reviennent dans leur salle (en réserve si leur place a
  été prise).
- Une exposition à la fois, 30 jours entre deux.

## 16. Classement mondial
- Les musées réels de Wikidata qui ont une fréquentation annuelle renseignée
  (environ 500), mis à jour par la GitHub Action du catalogue.
- Note de prestige d'un musée = somme du prestige des œuvres du catalogue
  qu'il conserve. Celle du joueur = somme du prestige de ses œuvres restaurées.
- Classement principal par fréquentation annualisée, classement secondaire
  par prestige. Mise à jour chaque jour à 4 h.
- Affichage : rang, musées juste au-dessus et en dessous, écart à combler.

## 17. Rapport quotidien
À la première ouverture du jour : visiteurs de la veille, fréquentation
annualisée, satisfaction, réputation, évolution au classement, nouvel arrivage,
demandes de prêt, fin de prêt ou d'exposition.

## 18. Notifications push
Web Push via Edge Function et pg_cron, comme Wikideck. Activables une par une :
fin de session ; nouvel arrivage ; arrivage qui expire dans 24 h ; demande de
prêt ; dépassement au classement (gagné ou perdu) ; nouveau statut ; fin
d'exposition temporaire.

## 19. Écrans
Refonte du 6 novembre 2026 : la gestion n'est plus rangée dans des
sous-onglets, chaque décision se prend là où elle agit.

- Barre flottante à cinq entrées : **Plan**, **Visite**, **Atelier** (bouton
  rond au centre), **Collection**, **Équipe**. Le nom du musée ouvre le
  Profil (statut, classement, rapport, historique, expositions, réglages), le
  solde ouvre les Finances (billet, heure de session type, campagnes).
- **Plan** : le bâtiment en maquette 3D vue d'en haut (ailes à l'arrière,
  rangée des services au premier plan : accueil, poste de sécurité, atelier,
  réserve, collection privée). Trois modes : Musée (alertes de chaque pièce,
  indicateurs, restauration en cours, liste « À traiter »), Construire (les
  emplacements à bâtir avec leur prix et leurs heures de chantier), Équipe
  (glisser le badge d'un agent sur une pièce l'y affecte). Toucher une pièce
  ouvre sa fiche : œuvres, gardiennage, sécurité, agrandissement.
- **Visite** : les salles en perspective (plafond, parois, parquet, spots),
  accrochage par glisser-déposer depuis l'étagère fixée au-dessus de la barre.
- **Collection** : les arrivages de la semaine en tête, puis toutes les œuvres.
- **Équipe** : les badges par service (sécurité, atelier, public, direction),
  les candidats, les métiers ; côté sécurité, enquêtes, matériel commun et
  derniers incidents.
- **Ambiance** : Relief le jour, Nocturne le soir (de 20 h à 8 h), ou figée
  dans les réglages.

## 20. Repères d'équilibrage
Simulation de référence : sessions quotidiennes, une œuvre à la fois, toujours
le plus haut niveau accessible, toutes les œuvres exposées, réputation 60,
sans thèmes de salle, billet à 1 éclat. Délai pour atteindre chaque statut :
| Statut | 2 h/jour | 3 h/jour | 4 h/jour | Gain par heure de session |
|---|---|---|---|---|
| Municipal | 3 jours | 4 jours | 4 jours | environ 10 |
| Régional | 24 jours | 16 jours | 13 jours | environ 70 |
| National | 5 mois | 3,5 mois | 2,7 mois | environ 700 |
| International | 17 mois | 10 mois | 8 mois | environ 2 900 |
| Universel | 2,6 ans | 1,6 an | 1,1 an | environ 8 200 |
Fournir un script de simulation (Node, moteurs du jeu importés) qui reproduit
ce tableau, pour vérifier l'équilibrage après chaque changement de paramètre.
