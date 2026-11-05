# Changelog

Toutes les évolutions notables de Hakoot. Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versions [SemVer](https://semver.org/lang/fr/).

## [1.1.0] - 2026-11-05

### Ajouts

- **API REST** (`/api`) pour créer, lire, modifier et supprimer des quiz stockés côté serveur, avec clé API (`HAKOOT_API_KEY`), accès local sans clé, protection DNS rebinding et limitation de débit.
- **Serveur MCP** pour les IA : intégré en HTTP (`/mcp`) et en stdio (`mcp/stdio.js`). Outils `create_quiz`, `add_questions`, `update_quiz`, `get_quiz`, `list_quizzes`, `delete_quiz`, `validate_quiz`, `list_live_games`.
- `.mcp.json` et skill Claude `hakoot-quiz` : Claude Code détecte le serveur MCP et sait écrire de bons quiz.
- **Lien de lancement direct** `/launch/:id` qui crée la partie en un clic.
- Section **Quiz du serveur** dans la bibliothèque (lancer, copier dans mes quiz, supprimer).
- `npm run key` pour générer une clé API, `.env.example`, documentation `docs/API.md`.
- **Batterie de tests** : unitaires (validation, moteur de jeu avec horloge simulée, stockage, authentification), intégration (Socket.IO, API, MCP HTTP et stdio), charge (150 joueurs) et interface dans un vrai navigateur.
- Intégration continue GitHub Actions (Linux et Windows, Node 20 et 22) et releases automatiques avec archive prête à l'emploi.

### Changements

- Validation des quiz plus tolérante pour les IA : réponses au format `{ text, correct }`, booléen pour les vrai/faux, chrono et points arrondis aux valeurs autorisées, alias `question` pour `text`.
- Arrêt propre du serveur (SIGINT/SIGTERM) : les joueurs sont prévenus.

## [1.0.0] - 2026-11-05

### Ajouts

- Première version : quiz multijoueur en direct avec code PIN et QR code, éditeur de quiz, lobby, chrono, révélation, classement, podium, export CSV.
- Reconnexion automatique des joueurs et de l'hôte, serveur autoritaire.
- Design néo-brutaliste « jeu télé ».

[1.1.0]: https://github.com/Siruuis/hakoot/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Siruuis/hakoot/releases/tag/v1.0.0
