# Mise en service

Trois étapes dans le tableau de bord Supabase (projet `psutbulpezfdftmaqkoo`),
une dans GitHub. Aucune ne touche aux tables des autres applications.

## 1. Le schéma

Éditeur SQL : coller tout `supabase/schema.sql`, exécuter. Rejouable sans
risque. Il crée les tables `musee_*`, leurs fonctions, le bucket privé
`musee-images` et trois tâches pg_cron (`musee-quotidien` chaque heure,
`musee-sessions` chaque minute, `musee-purge` chaque nuit).

Il remplit aussi le coffre : l'adresse de la fonction, et une clé d'appel
tirée au hasard que pg_cron envoie et que la fonction relit elle-même dans le
coffre (`musee_cle_cron()`, réservée à la clé de service). Personne ne la
recopie.

## 2. L'Edge Function

Edge Functions, puis « Deploy a new function », puis « Via Editor » :

- nom : `musee` ;
- contenu : tout le fichier `supabase/functions/musee/index.ts` ;
- désactiver « Verify JWT » (l'appel est protégé par la clé du coffre).

Aucun secret à ajouter. Les notifications reprennent les clés VAPID posées
pour WikiDeck (`VAPID_PUBLIC`, `VAPID_PRIVATE`, secrets communs aux Edge
Functions du projet) ; sans elles, le jeu tourne mais rien n'est notifié.

## 3. Vérifier

```sql
select name from vault.secrets where name like 'musee_%';
select jobname, schedule from cron.job where jobname like 'musee-%';
select public.musee_appeler('quotidien');
```

Deux secrets, trois tâches. Quelques secondes plus tard :

```sql
select created, status_code, left(content, 80) as reponse
  from net._http_response
 where content like '{"type"%' or content like '{"erreur"%' or content like 'Refus%'
 order by created desc limit 3;
```

La réponse de Musée commence par `{"type":"quotidien"` et doit être un 200.
Un 401 « Refusé » signale une clé absente du coffre (rejouer le schéma).

## 4. GitHub

Dépôt `Blinytz/musee`, Pages en mode « GitHub Actions ». Le tirage des
arrivages lit `musee_catalogue` : il faut la remplir avant le premier musée.

1. Settings, Secrets and variables, Actions : secret
   `SUPABASE_SERVICE_ROLE_KEY`, avec la clé secrète du projet (Supabase,
   Project Settings, API Keys : la même que `ECLATS_SERVICE_KEY` de WikiDeck).
2. Actions, workflow « Catalogue », Run workflow, case `synchro_seule` cochée :
   la table se remplit depuis le catalogue publié, sans reconstruction.

Chaque mois ensuite, le workflow reconstruit le catalogue et synchronise seul.

## Redéployer après une modification des moteurs

```bash
node outils/fonction.mjs
```

puis recoller `supabase/functions/musee/index.ts` dans l'éditeur de la
fonction : le serveur et l'application doivent toujours jouer les mêmes
règles.
