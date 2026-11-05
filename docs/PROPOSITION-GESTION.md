# Proposition : gestion du musée

Document de travail du 05/11/2026, à valider avant de coder. Il remplace,
une fois accepté, les sections correspondantes de `ECONOMIE.md`.

## Principes

1. **On ne paie et on ne gagne qu'en jouant.** Toutes les charges tombent en
   fin de session, comme les salaires aujourd'hui. Ne pas jouer ne coûte rien
   et ne rapporte rien. Seuls les vols, les enquêtes et les réparations
   avancent en vrai temps.
2. **Le départ est lent, c'est voulu.** Il faut investir un moment avant que
   le musée rentre dans ses frais.
3. **Pas de pluie d'Éclats.** Un grand musée coûte cher à faire tourner : la
   part de recettes que l'on garde diminue quand le musée grandit.
4. **Tout se lit en clair.** Chaque Éclat qui part a une ligne à son nom. Plus
   de part abstraite, plus de points de protection.
5. **Aucune fraction d'Éclat** dans un montant payé ou versé.

## 1. L'argent

### Le billet encaissé en entier

Aujourd'hui, le musée ne garde qu'une part du billet, qui monte avec le statut
(5 % pour une galerie, 50 % pour le musée universel). Cette part disparaît :
le billet est encaissé en entier, puis chaque dépense est retirée en clair.

À la fin d'une session, par heure :

| Ligne | Calcul |
|---|---|
| Recettes | visiteurs du jour × prix du billet |
| Accueil | visiteurs du jour × coût d'un visiteur (ménage, énergie, billetterie) |
| Salaires | comme aujourd'hui, selon le profil de chacun |
| Entretien | par salle et par aile, revalorisé avec le statut |
| Assurance | selon la valeur des œuvres exposées et le risque de chaque salle |
| Fournitures | selon le niveau de l'œuvre que tu restaures |
| Impôt | barème progressif sur ce qui reste, comme aujourd'hui |
| **Net** | ce qui est versé sur la Centrale |

Ce que ça change dans le jeu :

- **Le prix du billet devient un vrai choix.** Il doit couvrir le coût d'un
  visiteur. Un billet cher rapporte plus par visiteur mais en attire moins,
  donc ralentit la montée en statut, qui se joue sur la fréquentation.
- **Une salle vide coûte** son entretien : on n'agrandit plus sans raison.
- **La sécurité se paie aussi en assurance** : une salle bien protégée coûte
  moins cher à assurer. Un vol est remboursé en partie.
- **Restaurer un Trésor consomme plus** de fournitures qu'une Mineure.

### Plus cher en grandissant

- **Chantiers** : une salle ou une aile coûte des Éclats, puis demande des
  heures de session pour sortir de terre, comme une restauration. Pendant le
  chantier, la salle voisine est fermée.
- **Cote du musée** : plus ton statut est élevé, plus les vendeurs demandent
  cher (×1 jusqu'au régional, puis ×1,3, ×1,8 et ×2,5).
- **Salles et ailes** de plus en plus chères, comme aujourd'hui.

### Premier calibrage

Simulation d'équilibrage, joueur de référence à 2 h par jour, billet à 1 ✦,
jusqu'au musée universel (environ 2,8 ans). Les délais d'accès aux statuts ne
changent pas : ils dépendent des visiteurs, pas de l'argent.

| Statut | Visiteurs par jour | Net par heure aujourd'hui | Net par heure proposé | Part gardée |
|---|---|---|---|---|
| Musée municipal | 131 | 11 ✦ | 12 ✦ | 9 % |
| Musée régional | 455 | 66 ✦ | 38 ✦ | 8 % |
| Musée national | 3 008 | 535 ✦ | 255 ✦ | 8 % |
| Musée international | 8 732 | 1 810 ✦ | 615 ✦ | 7 % |
| Musée universel | 17 994 | 4 350 ✦ | 920 ✦ | 5 % |

| Sur toute la partie | Aujourd'hui | Proposé |
|---|---|---|
| Net versé sur la Centrale | 3,0 M ✦ | 1,45 M ✦ |
| Part du net redépensée dans le musée | 16 % | 40 % |
| Avance maximale avant rentabilité | 68 000 ✦ | 43 000 ✦ |

Réglages essayés : coût d'un visiteur de 0,60 ✦ (galerie) à 0,76 ✦
(universel) ; entretien de 5 ✦ par salle et par aile, revalorisé ×1 à ×20 ;
assurance de 0,12 % de la valeur exposée par heure, majorée selon le risque ;
fournitures de 0 à 300 ✦ par heure selon le niveau. Un réglage plus serré
(coût d'un visiteur jusqu'à 0,78 ✦, cote ×2,5) donne 480 ✦ par heure au
sommet et 47 % redépensés. Le réglage fin se fera à la construction.

## 2. La sécurité, salle par salle

- **Deux menaces** : le vol et le vandalisme. Plus de distinction entre jour
  et nuit.
- **Chaque espace a sa sécurité** : salles, réserve, atelier, collection
  privée. Le risque d'un espace dépend des œuvres qu'il contient, sa
  protection de ce qui y est installé et de qui le garde.
- **Le matériel s'achète par salle** : porte blindée, alarme, caméras,
  vitrines, détecteurs. Son prix dépend de la taille de la salle. Le blindage
  de la réserve remplace la salle forte.
- **Les gardiens sont affectés** à une, deux ou trois salles. Leur protection
  se partage entre les salles qu'ils couvrent : un gardien seul dans la salle
  des Trésors la protège trois fois mieux que s'il couvre aussi deux autres
  salles. Une salle sans gardien reste fermée au public.
- **Le reste du personnel de sécurité** (veilleurs, maîtres-chiens,
  opérateurs vidéo, pilotes de drone) s'affecte de la même façon, à une ou
  plusieurs salles.
- **Les vols peuvent arriver n'importe quel jour**, à une heure tirée au
  hasard. La probabilité par jour vaut environ celle d'aujourd'hui divisée
  par sept : le risque sur une semaine ne change pas.
- **Sur les murs**, la plaque de chaque salle montre son niveau de sécurité ;
  un appui ouvre sa fiche.

Pour un musée existant, le matériel déjà acheté est installé dans la salle la
plus précieuse, et chaque gardien affecté à une salle.

## 3. Les enquêtes

- **Un dossier par œuvre volée.** La police enquête seule, avec une petite
  chance chaque semaine. L'œuvre est perdue au bout de 26 semaines.
- **Les détectives** se recrutent comme le personnel : un niveau, une
  efficacité et un tarif propres, liés mais pas proportionnels, si bien qu'il
  y a de bonnes affaires. Ils gagnent un niveau en retrouvant des œuvres.
- **On peut en mettre plusieurs sur le même dossier.** Chacun a sa chance
  chaque semaine ; seul celui qui ramène l'œuvre touche la prime.
- **Paiement** : un forfait au départ, selon la durée de mission choisie
  (2, 4 ou 8 semaines), puis une prime de 5 % du prix de l'œuvre au
  détective qui la retrouve, réglée à la fin de ta session suivante.
- **Des pistes** arrivent parfois en cours de mission : racheter
  discrètement (sûr, mais cher) ou prévenir la police (gratuit, incertain).
- **Une œuvre retrouvée** revient abîmée et part en réparation à l'atelier.

## 4. L'atelier et les réparations

- **Tu ne restaures jamais deux fois la même œuvre.** Une œuvre abîmée
  (vandalisme, retour de vol, usure) part à l'atelier et l'équipe la répare
  en vrai temps : d'un jour pour une Mineure peu touchée à quatre ou cinq
  jours pour un Trésor très abîmé.
- **Raviver une œuvre** : on peut aussi envoyer à l'atelier une œuvre
  intacte. Elle en ressort avec un attrait de nouveauté renouvelé, ce qui
  pousse à faire tourner les œuvres exposées.
- **L'usure est lente** : une œuvre exposée demande une réparation tous les
  deux à trois mois environ. Elle attire un peu moins de monde à mesure
  qu'elle s'use.
- **La capacité de l'atelier est limitée** par sa taille (des emplacements,
  à agrandir) et par son équipe (le nombre et le niveau des restaurateurs).
  Réparations, ravivages et tes propres restaurations se partagent ces
  emplacements : c'est là que l'on arbitre son temps.
- **La collection privée** devient le lieu de repos : les œuvres y sont à
  l'abri des vols et du vandalisme, et retrouvent tout leur attrait de
  nouveauté en 15 jours, au lieu de 30 en réserve.

## 5. Déplacer les œuvres sans effort

- **Une vue Collection** : toutes les œuvres, avec leur emplacement, leur
  état et leur attrait, filtrables par lieu, niveau, support et thème, et une
  recherche par titre ou artiste.
- **Des actions directes** sur chaque œuvre : accrocher, envoyer à l'atelier,
  mettre au repos, ranger.
- **Un glisser-déposer amélioré** : défilement automatique près des bords,
  places interdites grisées pendant le glisser, œuvre qui se soulève et se
  pose en douceur, carte « Restaurer » masquée pendant le geste.

## Ordre de construction

Chaque étape est publiable seule. Celles qui touchent au moteur demandent de
recoller la fonction Supabase.

1. L'argent : billet entier, charges en clair, chantiers, cote.
2. L'atelier : réparations en vrai temps, ravivage, capacité, collection
   privée, vue Collection et glisser-déposer.
3. La sécurité salle par salle et les vols quotidiens.
4. Les détectives et les pistes.

## Points à trancher

- **L'avance de départ** : environ 43 000 ✦ (430 € à la parité de Cagnottes)
  avant que le musée rembourse, pour le joueur de référence. Acceptable ?
- **Le niveau de sortie** : environ 900 ✦ par heure au sommet (9 € par heure
  de concentration). Plus, ou moins ?
