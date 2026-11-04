# Consignes de travail : Musée

À lire avant toute modification. La spécification d'origine est
`docs/SPEC.md`, complétée par `docs/ECONOMIE.md` (impôts, personnel,
sécurité) ; ce qui suit en tranche les points d'application.

## Ce qui ne se négocie pas

1. **Aucune valeur de règle en dur.** Tout paramètre du jeu vit dans
   `js/config.js` et se règle depuis l'écran Réglages (surcharges stockées
   dans l'état, appliquées par `configEffective`). Un moteur reçoit toujours
   `cfg` en paramètre.
2. **Un seul moteur, trois exécutions.** `js/moteur/` est pur (ni DOM, ni
   `window`, ni stockage) et tourne à l'identique dans l'application, dans la
   simulation Node (`outils/simulation.mjs`) et dans l'Edge Function
   (`supabase/source/musee.js`, assemblée par `outils/fonction.mjs`). Toute
   modification d'un moteur demande de réassembler la fonction et de la
   redéployer.
3. **Tout hasard part d'une graine.** Le serveur et l'application rejouent
   les mêmes journées et doivent obtenir le même état. Jamais de
   `Math.random()` dans `js/moteur/` (sauf `uuid()`, réservé aux actions du
   joueur).
4. **Le tirage d'une œuvre a deux implémentations qui doivent rester
   identiques** : `rangTirage` (JavaScript) et `musee_rang` (SQL). Un test
   les compare.
5. **L'heure d'une session est celle du serveur** (`musee_session_demarrer`),
   l'application ne fait que l'afficher avec le décalage relevé sur l'en-tête
   `Date`. Le résultat se recalcule depuis le début, la durée et ce qui a été
   figé au lancement : quitter l'application ne perd rien.
6. **Argent** : une dépense passe au registre avant l'état (file d'opérations
   rejouée avec la même clé si l'application se ferme entre les deux) ; un
   gain s'écrit dans l'état « à verser » avant le registre, et se rattrape au
   chargement suivant. `eclats_spend` pouvant débiter partiellement, une
   dépense ajustée est remboursée et refusée.
7. **Écritures d'état conditionnées à la version lue** (`musee_enregistrer`).
   En cas de conflit, on relit et on rejoue l'action sur l'état frais.
8. **Une œuvre n'a qu'un emplacement**, porté par l'œuvre (`lieu`, `espace`,
   `place`). Le contenu d'une salle se déduit, il n'est jamais stocké.
9. **Les charges ne tombent qu'en fin de session**, sur l'argent des visites :
   salaires, puis impôt sur le bénéfice. Jamais de prélèvement hors session,
   jamais de dette sur la Centrale ; ce qui n'est pas couvert devient des
   arriérés reportés sur la session suivante.
10. **Une œuvre non restaurée garde son mystère** : support et siècle,
   mouvement et artiste avec la bibliothèque, titre avec les archives, tout le
   reste à 100 %. La découverte pendant la restauration fait partie du jeu.
11. **L'image source n'est jamais lue pixel par pixel** dans le rendu : les
    serveurs de musées n'envoient pas tous d'en-têtes CORS.
12. **Aucun tiret long visible** (« — », « – », « − »). Un test le vérifie.
13. **Interfaces sans texte d'explication** : titres et libellés courts, un
    message seulement pour une erreur ou un état.

## Données et quotas

- Le projet Supabase est partagé par tout l'écosystème, son quota aussi. Ce
  qui écrit en continu a sa rétention posée dans `supabase/schema.sql`
  (sessions à 30 jours, journal de nos tâches pg_cron à 3 jours) ; l'état
  garde 400 jours d'historique et 2 000 sessions.
- Le catalogue complet vit en fichiers statiques sur GitHub Pages ; la base
  n'en garde que `id, niveau, prestige, support, musee`.
- Toutes les applications partagent l'origine `blinytz.github.io` : le
  service worker ne supprime que les caches préfixés `musee-`.

## Commandes

- `node --test` : tous les tests (moteurs, argent, Edge Function, Web Push,
  garde-fous, équilibrage).
- `node outils/simulation.mjs` : tableau d'équilibrage de la section 20.
- `node outils/serveur.mjs 4338` puis `http://localhost:4338/?demo` :
  démonstration locale (Éclats fictifs, horloge avançable dans Réglages).
- `node outils/fonction.mjs` : réassemble l'Edge Function.
- `node outils/icones.mjs <phosphor>/assets` : pictogrammes de l'interface.
- Portraits du personnel : `js/vendor/portraits.js`, assemblé par esbuild
  depuis `@dicebear/core` et `@dicebear/notionists` 9.4.2 (aucun dessin à la
  main, aucune IA). Ne se charge qu'à la première fiche affichée.

## Publication

Dépôt `Blinytz/musee`, GitHub Pages par le workflow `deploy-pages`. Ne
jamais publier sans avoir regardé l'interface (capture d'écran) : les tests
ne voient pas la mise en page.
