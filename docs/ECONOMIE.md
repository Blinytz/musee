# Impôts, personnel et sécurité

Ajout du 3 novembre 2026 à la spécification (`SPEC.md`), demandé pour tempérer
la courbe des gains et donner une gestion au musée. Il remplace, dans la
section 0, « aucun coût récurrent » : les charges existent, mais elles ne
tombent qu'en fin de session, sur l'argent des visites. Tous les nombres
ci-dessous vivent dans `js/config.js` et se règlent dans Réglages.

## 1. Fin de session : recettes, charges, impôts

À la fin d'une session, dans cet ordre :

1. **Recettes** = visiteurs par jour × billet × part du statut × bonus de
   revenus × heures (formule de la section 10).
2. **Salaires** = masse salariale horaire × heures. Elle est figée au
   lancement, comme le taux de recettes.
3. **Arriérés** : si les recettes ne couvrent pas les salaires, le reste dû
   passe sur la session suivante. Au-delà de 10 heures de masse salariale en
   retard, on ne recrute plus.
4. **Impôt** sur le bénéfice (recettes - salaires - arriérés réglés), barème
   progressif appliqué au bénéfice horaire :

   | Bénéfice par heure | Taux marginal |
   |---|---|
   | jusqu'à 100 ✦ | 0 % |
   | de 100 à 1 000 ✦ | 20 % |
   | de 1 000 à 4 000 ✦ | 40 % |
   | au-delà de 4 000 ✦ | 55 % |

   Les salaires sont déductibles : plus on gagne, moins un employé coûte
   réellement. Le comptable réduit l'impôt.
5. **Net** crédité sur la Centrale. La rémunération d'un prêt n'est pas
   imposée.

Il n'existe pas de fraction d'Éclat. Un taux peut en avoir (un salaire de
0,5 ✦ par heure), mais chaque montant dû ou versé est arrondi à l'Éclat le
plus proche : recettes, salaires, arriérés, impôt. Le net est leur
différence exacte.

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
| Assistant restaurateur | municipal | 1 | avance une autre œuvre de l'atelier pendant tes sessions : (12 + 3 n) % de ton travail, jusqu'à 30 % de l'œuvre |
| Médiateur | galerie | 0,6 | satisfaction + (1,5 + 0,5 n), plafond +15 pour l'ensemble |
| Agent d'accueil | galerie | 0,5 | seuil d'affluence + (6 + 2 n) % |
| Chargé de communication | municipal | 1 | campagnes - (10 + 4 n) %, + 1 jour tous les 3 niveaux |
| Conservateur | régional | 1,5 | arrivages + 1 œuvre dont une du plus haut niveau ; + 2 dès le niveau 6 |
| Régisseur des œuvres | régional | 1 | demandes de prêt + 15 points de probabilité, rémunération + (10 + 3 n) %, œuvres volées retrouvées + (2 + n) points |
| Commissaire d'exposition | national | 1,5 | attrait des expositions × (1,1 + 0,03 n), emprunts - (10 + 3 n) % |
| Comptable | national | 1,2 | impôt - (5 + 2 n) % |

Pour les métiers « une seule tête » (communication, conservateur, régisseur,
commissaire, comptable), seul le meilleur compte.

**Salles et gardiens** : une salle ouvre si un gardien la tient. Les gardiens
vont d'abord aux salles qui ont le plus de prestige accroché ; l'exposition
temporaire en demande un aussi. Une salle fermée n'attire personne et ses
œuvres ne vieillissent pas. Le musée démarre avec un gardien.

Les anciens investissements « Médiateurs » et « Conservateur » deviennent des
métiers.

## 3. Sécurité

Trois menaces, chacune avec son risque, sa protection et son tirage du
dimanche à 4 h. Chaque métier et chaque équipement protège contre certaines
d'entre elles seulement : on ne se couvre pas avec un seul achat.

| Menace | Ce qui l'attire | Conséquence |
|---|---|---|
| **Cambriolage** (la nuit) | prestige de tout ce que le musée garde, pondéré par l'emplacement : salle 1, privé 0,8, réserve 0,6 (0,2 en salle forte), atelier 0,5 | une œuvre volée, au prorata du prestige ; réputation - 3, confiance - 1 |
| **Vol en salle** (en journée) | prestige des œuvres exposées, multiplié par l'affluence (0,5 + densité / 100, plafond 3) | une œuvre exposée volée ; estampes et photographies, faciles à glisser sous un manteau, comptent double, les sculptures moitié ; réputation - 2, confiance - 0,5 |
| **Vandalisme** | la célébrité des œuvres exposées : prestige^1,5 / 10. Négligeable pour une Mineure, écrasant pour un Trésor | l'œuvre est abîmée de 15 à 40 points, décrochée et renvoyée en réserve ; réputation - 2, confiance - 0,5 |

**Probabilité** par semaine = base × risque / (protection + plancher),
bornée. Bases : 3 %, 2 %, 2 % ; planchers : 5, 5, 20.

La **confiance** perdue est retirée des bonus permanents : elle abaisse pour
de bon la réputation vers laquelle le musée tend.

**Œuvres volées** : enquête chaque semaine, 7 % de chances de base, plus
l'enquêteur et le régisseur. Retrouvée, elle revient abîmée de 20 points.
Après 26 semaines, elle est perdue.

### Pourquoi investir

1. Protéger ses œuvres : un Trésor volé, c'est 120 heures de travail en jeu.
2. Protéger sa réputation, donc ses visiteurs.
3. **Emprunter.** Pour une exposition temporaire, les musées ne prêtent que
   si le pire des trois risques reste sous leur seuil : 5 % par semaine pour
   une Majeure, 3 % pour un Chef-d'œuvre, 1,5 % pour un Trésor.
4. Exposer ses propres Chefs-d'œuvre et Trésors (sécurité niveaux 1 et 2).

### Matériel

| Matériel | Statut | Prix | Cambriolage | Vol en salle | Vandalisme | Ouvre le métier |
|---|---|---|---|---|---|---|
| Serrures renforcées | galerie | 300 | 5 | | | |
| Alarme * | municipal | 2 000 | 20 | | | Technicien de sécurité |
| Vidéosurveillance * | régional | 8 000 | 30 | 30 | | Opérateur vidéo |
| Portiques de détection * | régional | 6 000 | | 10 | 30 | Agent de sûreté |
| Salle forte | régional | 12 000 | réserve 0,2 | | | |
| Chenil | national | 10 000 | | | | Maître-chien |
| Vitrines sécurisées | national | 25 000 | | 80 | 120 | |
| Poste central de sécurité | national | 30 000 | 20 | 20 | | Chef de la sécurité |
| Sécurité niveau 1 | international | 40 000 | 200 | 100 | 60 | Chefs-d'œuvre exposables |
| Drones de surveillance * | international | 60 000 | 120 | | | Pilote de drone |
| Sécurité niveau 2 | universel | 150 000 | 500 | 300 | 300 | Trésors exposables |

\* matériel électronique, renforcé par le technicien. Le matériel ne vaut que
par ceux qui le servent : la vidéosurveillance ne donne que la moitié de sa
protection sans opérateur vidéo, et des drones sans pilote ne volent pas.

### Métiers de la sécurité (niveau n)

| Métier | Ouvert par | Base | Cambriolage | Vol en salle | Vandalisme | Autre |
|---|---|---|---|---|---|---|
| Gardien de salle | galerie | 0,5 | n | 3 n | | ouvre une salle |
| Veilleur de nuit | municipal | 0,5 | 6 n | | | |
| Agent de sûreté | portiques | 0,5 | | 2 n | 8 n | fouille à l'entrée |
| Opérateur vidéo | vidéosurveillance | 0,6 | 4 n | 4 n | | rend la vidéo pleinement efficace |
| Maître-chien | chenil | 0,7 | 12 n | | | |
| Technicien de sécurité | alarme | 0,8 | | | | matériel électronique + (10 + 3 n) % ; un seul compte |
| Chef de la sécurité | poste central | 1,2 | | | | toute la protection humaine + (10 + 3 n) % ; un seul compte |
| Enquêteur | national | 1 | | | | œuvres volées retrouvées + (3 + 1,5 n) points par semaine ; un seul compte |
| Pilote de drone | drones | 1 | 25 n | | | |

Les drones et le chenil ne protègent que grâce aux pilotes et aux
maîtres-chiens qui les accompagnent. Un matériel qui ouvre un métier amène
aussitôt un premier candidat de ce métier, sans attendre le lundi.

## 4. Effet mesuré (`node outils/simulation.mjs`)

Joueur de référence (section 20 de la spec) : un gardien par salle garnie, une
équipe de sécurité modeste (un veilleur par statut, un exemplaire de chaque
métier spécialisé dès que son matériel est là), tout le matériel dès qu'il
s'ouvre, aucun autre employé.

| Statut | Brut par heure | Net par heure |
|---|---|---|
| Municipal | 11 à 13 | 9 à 11 |
| Régional | 68 à 91 | 56 à 79 |
| National | 722 à 760 | 522 à 552 |
| International | 3 060 à 3 130 | 1 790 à 1 840 |
| Universel | 8 780 à 9 000 | 4 360 à 4 440 |

La sécurité doit se payer d'elle-même : à 2 h par jour sur 1 000 jours, avec la
réputation que calcule le jeu (`--horizon 1000 --reputation libre`) :

| | Avec l'équipe | Sans équipe (matériel seul) |
|---|---|---|
| Recettes | 6,14 M | 4,86 M |
| Salaires | 0,80 M | 0,18 M |
| Net | 3,49 M | 3,18 M |
| Vols et vandalismes | 13 | 27 |
| Œuvres perdues pour de bon | 0 | 6 |

Les délais d'accès aux statuts restent dans les repères de la spec.
