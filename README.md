# Musée

On acquiert des œuvres très abîmées avec des Éclats, on les restaure
uniquement par des sessions de concentration, on les expose pour attirer des
visiteurs, et le musée grandit jusqu'au classement mondial.

PWA en HTML, CSS et JavaScript sans dépendance, publiée sur GitHub Pages,
raccordée au registre commun des Éclats (Supabase de l'écosystème).

- Spécification : [docs/SPEC.md](docs/SPEC.md)
- Consignes de travail : [AGENTS.md](AGENTS.md)
- Mise en service Supabase : [docs/INSTALLATION.md](docs/INSTALLATION.md)
- Format du catalogue : [docs/CATALOGUE.md](docs/CATALOGUE.md)

## Organisation

| Dossier | Rôle |
|---|---|
| `js/config.js` | tous les paramètres du jeu |
| `js/moteur/` | règles pures, partagées avec la simulation et l'Edge Function |
| `js/rendu/` | rendu canvas de la restauration, adresses d'images |
| `js/donnees/` | registre commun et schéma Musée (Supabase), mode démonstration |
| `js/jeu.js` | orchestrateur : moteurs, état, Éclats |
| `js/ui/` | écrans |
| `supabase/` | schéma SQL, source et assemblage de l'Edge Function |
| `outils/` | simulation, catalogue, serveur local, assemblage |
| `catalogue/` | catalogue publié, produit chaque mois |

## Démonstration locale

```bash
node outils/serveur.mjs 4338
```

puis `http://localhost:4338/?demo` : Éclats fictifs, aucun compte, horloge
avançable depuis Réglages.
