# Pipeline du catalogue

Format de sortie : [`docs/CATALOGUE.md`](../../docs/CATALOGUE.md). Node 22 ou
plus, aucune dépendance npm ; `bzip2` (ou `lbzip2`) et `curl` pour les dumps.

## Lancer

Depuis `outils/catalogue/` :

```bash
node wikidata.mjs
```

```bash
node vues.mjs --manquants 2
```

```bash
node construire.mjs
```

```bash
node verifier-images.mjs 5
```

```bash
node supabase-sync.mjs --a-sec
```

| Étape | Rôle | Durée mesurée (poste local, 3 nov. 2026) |
|---|---|---|
| `wikidata.mjs` | œuvres avec page fr ou en, artistes, musées classés → `cache/wikidata.json` | 4 à 6 min (QLever, une requête toutes les 4 s) |
| `vues.mjs` | pages vues d'un mois depuis le dump Wikimedia → `etat/vues/AAAA-MM.json` | 15 à 25 min par mois (26 à 40 Go de texte), 12 mois en 1 h 55 à deux de front |
| `construire.mjs` | sources d'API, images, niveaux, ids → `catalogue/` | ~15 min à froid hors Met, ~2 min avec le cache |
| `supabase-sync.mjs` | lignes changées de `musee_catalogue` | selon le diff |

`vues.mjs 2026-10` traite un mois précis ; `--manquants 2` traite les 12
derniers mois absents de `etat/vues/`, deux à la fois ; `--completer 2026-10`
relit un mois déjà traité pour les seules entités apparues depuis.

Le Met est la source lente : son pare-feu bloque l'adresse dès qu'on dépasse
quelques requêtes par seconde (constaté à 8 en parallèle). Le pipeline s'y tient
à 2 par seconde, soit environ une œuvre par seconde (fiche puis en-tête de
l'image), s'arrête net au premier refus sans le mémoriser, et reprend au
passage suivant. `MET_PLAFOND` borne le nombre d'œuvres par passage.

## Reprendre

- `cache/` (ignoré par Git) garde les réponses SPARQL du jour, les CSV du jour,
  les listings AIC (20 jours) et les images Met, AIC, Rijksmuseum, Commons déjà
  résolues. Relancer une étape interrompue ne refait que ce qui manque.
- `etat/` (commité) garde ce qui doit survivre d'un mois à l'autre : les ids
  (`ids.json`, `musees-ids.json`), les pages vues des 12 derniers mois, et les
  artistes cités par les API que l'extraction suivante doit ajouter.
- Un mois de pages vues absent rend le catalogue `provisoire` : les vues sont
  ramenées à 12 mois par proportion, et `meta.json` le dit.

## Variables

| Variable | Effet |
|---|---|
| `RIJKS_PLAFOND` | estampes et photographies du Rijksmuseum lues par type (0 par défaut ; il y en a 390 000 et 122 000 avec image, trois requêtes chacune) |
| `MET_PLAFOND` | nombre maximal d'appels d'image Met par passage |
| `SANS_API=1` | ne garde que les œuvres Wikidata |
| `SOURCES` | sources d'API actives, `rijks,met,aic,nga` par défaut |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | synchronisation réelle |

## Mensuel

`.github/workflows/catalogue.yml`, le 2 du mois : Wikidata, un job par mois de
pages vues manquant (deux en parallèle), assemblage, commit, relance de la
publication Pages, synchronisation Supabase si les secrets existent.
