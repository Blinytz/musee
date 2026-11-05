# Gestion du musée : argent, personnel, sécurité, atelier

Ajout des 3 et 5 novembre 2026 à la spécification (`SPEC.md`), pour tempérer
la courbe des gains et donner une vraie gestion au musée
(`PROPOSITION-GESTION.md`). On ne paie et on ne gagne qu'en jouant : toutes
les charges tombent en fin de session. Seuls les vols, les enquêtes et les
travaux d'atelier avancent en vrai temps. Tous les nombres ci-dessous vivent
dans `js/config.js`.

## 1. Fin de session : le billet en entier, les charges en clair

Le billet est encaissé en entier ; chaque dépense est retirée en clair, par
heure de session, figée au lancement comme les recettes :

| Ligne | Calcul, par heure |
|---|---|
| Recettes | visiteurs du jour × prix du billet × bonus de revenus |
| Accueil | visiteurs du jour × coût d'un visiteur (0,60 ✦ en galerie à 0,76 ✦ au sommet) |
| Salaires | masse salariale, selon le profil de chacun |
| Entretien | 5 ✦ par espace public et par aile, × 0,4 à 20 selon le statut |
| Assurance | 0,12 % de la valeur exposée de chaque salle, majorée selon son risque |
| Fournitures | 0 à 300 ✦ selon le niveau de l'œuvre restaurée |
| Primes | primes des détectives qui ont ramené une œuvre, en une fois |
| Impôt | barème progressif sur ce qui reste (ci-dessous) |

Les indemnités d'assurance (la moitié du prix d'une œuvre volée) s'ajoutent
aux recettes de la session suivante. Ce que les recettes ne couvrent pas
devient des arriérés, jamais une dette ; au-delà de 10 heures de salaires et
d'entretien en retard, on ne recrute plus.

| Bénéfice par heure | Taux marginal |
|---|---|
| jusqu'à 100 ✦ | 0 % |
| de 100 à 1 000 ✦ | 20 % |
| de 1 000 à 4 000 ✦ | 40 % |
| au-delà de 4 000 ✦ | 55 % |

Il n'existe pas de fraction d'Éclat. Un taux peut en avoir (un salaire de
0,5 ✦ par heure), mais chaque montant dû ou versé est arrondi à l'Éclat le
plus proche, et le net est leur différence exacte.

**Le prix du billet** devient un vrai choix : il doit couvrir le coût d'un
visiteur, et un billet cher attire moins de monde, donc ralentit la montée en
statut. **Plus cher en grandissant** : la cote du musée relève le prix des
œuvres (× 1,3 au national, × 1,8 à l'international, × 2,5 à l'universel), et
salles, ailes, agrandissements et espaces sortent de terre en heures de
session (4, 10, 2 et 6 h), un chantier à la fois, pendant lesquelles le musée
perd 10 % de ses visiteurs.

## 2. Personnel

Chaque employé est une personne : un nom tiré par le moteur (aucune IA), un
métier, un niveau de 1 à 10. Il travaille pendant les sessions, et ces heures
le font progresser (seuils : 10, 30, 70, 140, 250, 400, 600, 850, 1 150 h).

**Salaire horaire** = base du métier × 1,15^(niveau - 1) × grille du statut.
La grille suit le rang de l'institution : 1, 2, 4, 10, 18, 25 de la galerie au
musée universel. Un passage de statut revalorise toute l'équipe.

**Profil** : deux personnes de même niveau ne se valent pas. Chacune a une
efficacité, de 75 % à 125 % de la moyenne du métier (tirée en cloche), qui
multiplie tout ce qu'elle apporte, et une prétention salariale de 75 % à
130 % de la grille, qui suit l'efficacité pour 60 % avec un écart propre à
chacun : il y a des affaires et des salaires trop élevés. Les moyennes
valent 1 : l'équilibrage d'ensemble ne bouge pas. L'équipe de départ et les
employés d'avant les profils sont dans la moyenne. Pour un métier « une
seule tête », le meilleur est le plus fort : niveau × efficacité.

**Recrutement** : chaque lundi, avec l'arrivage, cinq candidats tirés parmi
les métiers ouverts, valables sept jours. Leur niveau est plafonné par le
statut (2, 3, 4, 6, 8, 10). Embaucher coûte des frais de recrutement de
10 heures de salaire, payés sur la Centrale. Licencier est gratuit et
immédiat.

Les métiers de la sécurité sont décrits à la section 3.

| Métier | Statut | Base | Effet par employé (niveau n) |
|---|---|---|---|
| Assistant restaurateur | municipal | 1 | avance une autre œuvre de l'atelier pendant tes sessions : (12 + 3 n) % de ton travail, jusqu'à 30 % de l'œuvre ; répare et ravive les œuvres à l'atelier (section 4) |
| Médiateur | galerie | 0,6 | satisfaction + (1,5 + 0,5 n), plafond +15 pour l'ensemble |
| Agent d'accueil | galerie | 0,5 | seuil d'affluence + (6 + 2 n) % |
| Chargé de communication | municipal | 1 | campagnes - (10 + 4 n) %, + 1 jour tous les 3 niveaux |
| Conservateur | régional | 1,5 | arrivages + 1 œuvre dont une du plus haut niveau ; + 2 dès le niveau 6 |
| Régisseur des œuvres | régional | 1 | demandes de prêt + 15 points de probabilité, rémunération + (10 + 3 n) %, œuvres volées retrouvées + (2 + n) points |
| Commissaire d'exposition | national | 1,5 | attrait des expositions × (1,1 + 0,03 n), emprunts - (10 + 3 n) % |
| Comptable | national | 1,2 | impôt - (5 + 2 n) % |

Pour les métiers « une seule tête » (communication, conservateur, régisseur,
commissaire, comptable), seul le meilleur compte.

**Salles et gardiens** : une salle ouvre si un gardien la couvre. Chaque
gardien est affecté à une, deux ou trois salles ; l'exposition temporaire en
demande un aussi. Une salle fermée n'attire personne et ses œuvres ne
vieillissent pas. Le musée démarre avec un gardien, qui tient la salle 1.

Les anciens investissements « Médiateurs » et « Conservateur » deviennent des
métiers.

## 3. Sécurité, salle par salle

Deux menaces, le vol et le vandalisme, tirées chaque jour pour chaque espace
(salles publiques, exposition temporaire, réserve, atelier), à une heure tirée
au hasard. La collection privée est à l'abri.

- **Risque d'un espace** : le prestige de ses œuvres, pondéré pour le vol par
  l'emplacement (salle 1, réserve 0,6 ou 0,2 blindée, atelier 0,5), la
  facilité à emporter (estampes et photographies ×2, sculptures ×0,5) et
  l'affluence ; pour le vandalisme, la célébrité des œuvres exposées
  (prestige^1,5 / 10).
- **Protection d'un espace** : son matériel, le matériel commun (portiques
  contre le vandalisme, drones contre le vol), et les agents qui le couvrent.
  Un agent couvre une à trois salles et sa protection s'y partage.
- **Probabilité par jour** = base × risque / (protection + plancher), bornée.
  Un vol coûte 3 points de réputation et 1 de confiance ; un vandalisme abîme
  l'œuvre, qui part en réparation à l'atelier.

| Matériel par salle | Statut | Prix (× places / 6) | Vol | Vandalisme | Autre |
|---|---|---|---|---|---|
| Porte blindée | galerie | 300 | 5 | | aussi réserve et atelier |
| Alarme * | municipal | 1 500 | 15 | | ouvre le technicien |
| Caméras * | régional | 4 000 | 20 | 15 | moitié sans opérateur vidéo dans la salle |
| Vitrines sécurisées | national | 8 000 | 40 | 60 | |
| Blindage | régional | 12 000 | | | réserve seulement : 0,2 au lieu de 0,6 |
| Sécurité niveau 1 | international | 20 000 | 60 | 30 | Chefs-d'œuvre accrochables dans la salle |
| Sécurité niveau 2 | universel | 60 000 | 150 | 100 | Trésors accrochables dans la salle |

Matériel commun : portiques (vandalisme 15 partout, ouvrent l'agent de
sûreté), poste central (ouvre le chef de la sécurité), chenil (ouvre le
maître-chien), drones * (vol 40 partout, inutiles sans pilote). \* matériel
électronique, renforcé par le technicien.

| Agent (niveau n) | Vol | Vandalisme |
|---|---|---|
| Gardien de salle | 4 n | |
| Veilleur de nuit | 6 n | |
| Agent de sûreté | 2 n | 8 n |
| Opérateur vidéo | 8 n | |
| Maître-chien | 12 n | |
| Pilote de drone | 25 n | |

Le chef de la sécurité renforce tous les agents de (10 + 3 n) %, le
technicien le matériel électronique d'autant.

**Prêteurs** : pour une exposition, un musée ne prête que si la salle la plus
exposée reste sous son seuil par semaine (5 % pour une Majeure, 3 % pour un
Chef-d'œuvre, 1,5 % pour un Trésor).

**Enquêtes** : un dossier par œuvre volée. La police a 7 % de chances chaque
dimanche (plus le régisseur). On engage des détectives par mission (2, 4 ou
8 semaines, payées d'avance à 15 ✦ la semaine × 1,25 par niveau × grille du
statut × prétention), plusieurs par dossier ; chacun a (5 + 1,5 n) % de
chances par semaine × son efficacité. Celui qui ramène l'œuvre touche 5 % de
son prix (réglé avec la session suivante) et prend de l'expérience. Pendant
une mission, une piste peut apparaître : racheter discrètement (60 % du prix
coté) ou prévenir la police (+15 points la semaine suivante). Au bout de 26
semaines, l'œuvre est perdue. Retrouvée, elle revient usée, à réparer.

## 4. Atelier, usure et repos

- **Usure** : une œuvre exposée perd 0,5 % d'état par jour de visite et
  attire jusqu'à 40 % de moins. À 40 % d'usure, elle est à réparer ; à 80 %,
  elle ne s'accroche plus.
- **Réparation et ravivage** : un restaurateur (assistant) prend l'œuvre à
  l'atelier et la rend intacte en vrai temps, d'un à quelques jours selon son
  niveau, son usure et la vitesse du restaurateur. Une œuvre intacte peut
  aussi être ravivée. Au retour, elle retrouve sa place et un attrait de
  nouveauté de × 1,4.
- **Capacité** : les emplacements d'atelier (ceux du statut, plus jusqu'à
  quatre achetés) et les restaurateurs libres. Réparations, ravivages et
  restaurations se partagent les emplacements.
- **Collection privée** : à l'abri des vols et du vandalisme ; une œuvre qui y
  repose 15 jours ressort ravivée.

## 5. Effet mesuré (`node outils/simulation.mjs`)

Joueur de référence, à 2 h par jour jusqu'au musée universel : billet à
1 ✦, un gardien par salle garnie, une équipe de sécurité modeste, porte,
alarme et caméras dans chaque salle garnie et vitrines dans les deux plus
précieuses, réparations dès qu'une œuvre s'use.

| Statut | Net par heure |
|---|---|
| Municipal | 5 à 12 |
| Régional | 28 à 74 |
| National | 214 à 232 |
| International | 590 à 824 |
| Universel | 950 à 1 090 |

Sur toute la partie : environ 1,2 M d'Éclats nets (3 M avant cette
refonte), dont 55 à 70 % réinvestis dans le musée. Les délais d'accès aux
statuts restent à moins de 15 % des repères de la spec.
