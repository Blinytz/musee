# Mise en service

Quatre étapes dans le tableau de bord Supabase (projet `psutbulpezfdftmaqkoo`),
une dans GitHub. Aucune ne touche aux tables des autres applications.

## 1. Le schéma

Éditeur SQL : coller tout `supabase/schema.sql`, exécuter. Rejouable sans
risque. Il crée les tables `musee_*`, leurs fonctions, le bucket privé
`musee-images` et trois tâches pg_cron (`musee-quotidien` chaque heure,
`musee-sessions` chaque minute, `musee-purge` chaque nuit).

## 2. Les deux secrets du coffre

Musée reprend le secret de cron et les clés VAPID déjà posés pour WikiDeck
(`apps/wikideck/sql/ACTIVATION.md`) : les secrets d'Edge Function sont communs
à tout le projet. Dans l'éditeur SQL, remplacer `VALEUR` par le `cronSecret`
de `apps/wikideck/.secrets/vapid.json` (le même que `CRON_SECRET`) :

```sql
select vault.create_secret('https://psutbulpezfdftmaqkoo.supabase.co/functions/v1/musee', 'musee_url_fonction');
select vault.create_secret('VALEUR', 'musee_cle_cron');
```

## 3. L'Edge Function

Edge Functions, puis « Deploy a new function », puis « Via Editor » :

- nom : `musee` ;
- contenu : tout le fichier `supabase/functions/musee/index.ts` ;
- désactiver « Verify JWT » (l'appel est protégé par la clé de l'étape 2).

Aucun secret à ajouter si ceux de WikiDeck sont en place (`CRON_SECRET`,
`VAPID_PUBLIC`, `VAPID_PRIVATE`). Sinon, les poser d'abord selon
`apps/wikideck/sql/ACTIVATION.md`, étape 3.

## 4. Vérifier

```sql
select jobname, schedule from cron.job where jobname like 'musee-%';
select status_code, content from net._http_response order by created desc limit 3;
```

Après l'heure pleine suivante, la dernière réponse doit être un 200.

## 5. GitHub

Dépôt `Blinytz/musee`, Pages en mode « GitHub Actions ». Pour que le
catalogue mensuel alimente `musee_catalogue`, ajouter deux secrets au dépôt :
`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`. Lancer une première fois le
workflow « Catalogue » à la main.

## Redéployer après une modification des moteurs

```bash
node outils/fonction.mjs
```

puis recoller `supabase/functions/musee/index.ts` dans l'éditeur de la
fonction : le serveur et l'application doivent toujours jouer les mêmes
règles.
