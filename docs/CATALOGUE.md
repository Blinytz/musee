# Catalogue des œuvres : contrat de format

Le catalogue est construit chaque mois par `outils/catalogue/construire.mjs`
(GitHub Action `catalogue.yml`), sans IA, et publié en fichiers JSON statiques
sous `catalogue/` (servi à `https://blinytz.github.io/musee/catalogue/`). Les
images ne sont jamais stockées : seules leurs adresses et leur résolution le sont.

Ce document est le contrat entre le pipeline et l'application. Toute évolution
du format passe par ici d'abord.

## Identifiants

- Un id d'œuvre est un **entier** attribué une fois pour toutes et **jamais
  changé**. La correspondance clé → id vit dans `outils/catalogue/etat/ids.json`
  (commité, uniquement complété) : clés `Q12418` (Wikidata), `met:436535`,
  `aic:27992`, `nga:1234`, `rijks:200107928`.
- Si deux ids désignent plus tard la même œuvre (une œuvre d'API reçoit une
  fiche Wikidata), le plus petit reste canonique et l'autre est consigné dans
  `catalogue/fusions.json` (`{ "ancien": canonique }`). L'application résout
  les ids possédés à travers ce fichier.
- Même règle pour les musées (`outils/catalogue/etat/musees-ids.json`).

## Fichiers publiés

| Fichier | Contenu |
|---|---|
| `meta.json` | version, date de génération, taille de tranche, totaux, seuils de pages vues par niveau |
| `oeuvres/NNNN.json` | tableau des œuvres d'ids `[NNNN × 1000, NNNN × 1000 + 999]`, triées par id |
| `index/<support>-<niveau>.json` | ids triés des œuvres de ce support et de ce niveau (tirage local des arrivages) |
| `musees.json` | musées classés (fréquentation annuelle renseignée dans Wikidata) |
| `musees/<id>.json` | œuvres conservées par ce musée, en lignes compactes (emprunts d'exposition) |
| `fusions.json` | ids fusionnés |

`NNNN` est sur 4 chiffres. Supports : `peinture`, `sculpture`, `photographie`,
`estampe`. Niveaux : `0` Mineure, `1` Notable, `2` Remarquable, `3` Majeure,
`4` Chef-d'œuvre, `5` Trésor.

### Œuvre

```json
{
  "id": 123,
  "q": "Q12418",
  "cles": ["Q12418", "rijks:200107928"],
  "titre": "La Joconde",
  "titreEn": "Mona Lisa",
  "artiste": { "q": "Q762", "nom": "Léonard de Vinci" },
  "date": "1503-1519",
  "an": 1503,
  "support": "peinture",
  "mouvement": { "q": "Q1474884", "nom": "Haute Renaissance" },
  "pays": { "q": "Q38", "nom": "Italie" },
  "collection": { "q": "Q19675", "nom": "Musée du Louvre" },
  "musee": 17,
  "dim": [77, 53],
  "image": { "src": "commons", "fichier": "Mona Lisa.jpg", "w": 7479, "h": 11146 },
  "wiki": { "fr": "La Joconde", "en": "Mona Lisa" },
  "vues": 12345678,
  "niveau": 5
}
```

- Champs absents plutôt que `null` quand l'information manque.
- `titre`, noms d'artiste, de mouvement, de pays et de collection : français si
  Wikidata l'a, sinon anglais. `titreEn` seulement s'il diffère de `titre`.
  Une œuvre d'API sans page porte le titre de son musée : anglais (Met, AIC,
  NGA) ou néerlandais (Rijksmuseum, dont le profil léger n'a que celui-là).
- `pays` : pays d'origine de l'œuvre (P495), à défaut nationalité de l'artiste.
- `mouvement` : seulement pour les œuvres Wikidata (les API n'en donnent pas).
- `an` : année de début (négative avant notre ère), sert au thème « siècle ».
- `dim` : hauteur puis largeur, en centimètres.
- `wiki` : titres des pages fr et en (au moins une pour une œuvre « avec page »).
  Une œuvre sans page n'a pas de `wiki` et porte `"vuesArtiste": true` : ses
  `vues` valent 1 % de celles de son artiste.
- `musee` : id du musée **classé** qui conserve l'œuvre, s'il y en a un.

### Image

Une seule image par défaut, choisie dans cet ordre de priorité : Rijksmuseum,
Metropolitan Museum, Art Institute of Chicago, National Gallery of Art, puis
Wikimedia Commons, puis l'image principale de la page Wikipédia en anglais.

| `src` | Champs | Adresse construite par l'application |
|---|---|---|
| `rijks`, `aic`, `nga` | `iiif` (base IIIF), `w`, `h` | `${iiif}/full/!${L},${L}/0/default.jpg` |
| `met` | `url` (originale), `petite` (web-large), `w`, `h` | `petite` sous 1 000 px, `url` au-delà |
| `commons` | `fichier`, `w`, `h` | `https://commons.wikimedia.org/wiki/Special:FilePath/${fichier}?width=${L}` |
| `enwiki` | `fichier`, `w`, `h` | `https://en.wikipedia.org/wiki/Special:FilePath/${fichier}?width=${L}` |

`w` et `h` sont la résolution de l'image source en pixels : le zoom maximal du
mode inspection en dépend. Une œuvre sans aucune image n'entre pas au catalogue.

Deux champs facultatifs :

- `max` : plus grande largeur que le serveur accepte de servir (AIC : 1 686 px
  pour le domaine public, 843 px sinon). L'application plafonne `L` à
  `min(max, w)` et le zoom d'inspection en conséquence.
- `secours` : une seconde image (toujours `commons` ou `enwiki`, mêmes champs)
  quand l'image principale vient d'un musée. Le serveur IIIF de l'AIC passe
  par un pare-feu anti-robots qui peut refuser certaines requêtes : en cas
  d'échec de chargement, l'application bascule sur `secours`. Les œuvres
  d'API sans page n'en ont pas.

**L'AIC est écartée par défaut** (`SOURCES=rijks,met,nga`, variable de dépôt
`MUSEE_SOURCES` dans l'Action) : le 3 novembre 2026, son pare-feu bloquait ses
images jusque dans un navigateur ordinaire. Ses 59 000 œuvres sans page
sortent du catalogue, sans perdre leurs ids ; les 131 œuvres avec page encore
illustrées par l'AIC passent par leur `secours`. La réactiver après un essai
réussi sur téléphone : `SOURCES=rijks,met,aic,nga`.

### Musée

```json
{ "id": 17, "q": "Q19675", "nom": "Musée du Louvre", "ville": "Paris", "pays": "France",
  "visiteurs": 8700000, "annee": 2024, "prestige": 12345, "oeuvres": 523 }
```

`prestige` est la somme des prestiges (barème de `js/config.js`) des œuvres du
catalogue qu'il conserve. `musees.json` est trié par fréquentation
décroissante (l'ordre du classement). Y figurent les musées Wikidata dotés
d'une fréquentation annuelle (P1174), nommés en français ou en anglais, et
recevant au moins 10 000 visiteurs (`CLASSEMENT_MIN`) : 2 773 en novembre
2026. Wikidata en compte 7 900, dont 2 000 sans nom et des fréquentations d'un
visiteur par an. La spec en estimait 500 ; ce seuil garde un classement qu'on
remonte dès les premières semaines.

### Méta

`meta.json` porte aussi `moisVues` (les mois de pages vues effectivement
sommés) et `provisoire` (`true` si moins de 12 mois : les vues sont alors
ramenées à 12 mois par proportion).

### Ligne compacte de `musees/<id>.json`

`[id, support, niveau, an, artisteQ, mouvementQ, paysQ]`, valeurs absentes à
`null`. Suffit pour filtrer les emprunts par thème sans charger les tranches.

## Notoriété et niveaux

- Pages vues Wikipédia des 12 derniers mois complets, **toutes langues**,
  tirées des dumps mensuels `pageview_complete/monthly/*-user.bz2`, jamais de
  l'API page par page. Un mois traité est conservé dans
  `outils/catalogue/etat/vues/AAAA-MM.json` : la mise à jour mensuelle ne
  télécharge que le dernier mois.
- Les percentiles se calculent sur les seules œuvres avec page : Trésor top
  0,5 %, Chef-d'œuvre 0,5 à 2 %, Majeure 2 à 6 %, Remarquable 6 à 15 %, Notable
  15 à 35 %, Mineure le reste.
- Œuvre sans page : 1 % des pages vues de son artiste, Notable si ce chiffre
  atteint le seuil Notable, Mineure sinon.

## Supabase

Le pipeline pousse dans `musee_catalogue (id, niveau, prestige, support, musee)`
les lignes changées, avec la clé de service lue dans les secrets du dépôt. Rien
d'autre du catalogue n'entre dans la base partagée.
