# API et MCP

Hakoot expose une API REST et un serveur [MCP](https://modelcontextprotocol.io) pour créer des quiz depuis un script ou une IA (Claude, etc.). Les quiz créés ainsi apparaissent dans **Mes quiz → Quiz du serveur** et se lancent en un clic ou via un lien direct.

## Configuration

Variables d'environnement (ou fichier `.env` à la racine, voir `.env.example`) :

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `PORT` | `3000` | Port HTTP |
| `HAKOOT_API_KEY` | vide | Clé pour l'accès distant à l'API et au MCP |
| `HAKOOT_TRUST_LOCALHOST` | `true` | Autorise l'ordinateur hôte (localhost) sans clé |
| `HAKOOT_DATA_DIR` | `./data` | Dossier où sont stockés les quiz du serveur |
| `HAKOOT_PUBLIC_URL` | vide | URL publique utilisée dans les liens renvoyés (ex. `https://quiz.mondomaine.fr`) |

Générer une clé :

```bash
npm run key
```

### Authentification

- Depuis l'ordinateur hôte (`http://localhost`), aucune clé n'est nécessaire.
- Depuis une autre machine, envoie `Authorization: Bearer <clé>` ou `X-API-Key: <clé>`.
- Une clé fausse est toujours refusée, même en local.
- Les requêtes dont l'en-tête `Host` n'est pas `localhost` ne sont jamais considérées comme locales (protection contre le DNS rebinding).
- Limite : 300 requêtes par minute et par IP.

## Serveur MCP

### Claude Code

Le dépôt contient un `.mcp.json` : ouvre Claude Code dans le dossier du projet, le serveur `hakoot` est proposé automatiquement (le serveur Hakoot doit tourner). Ou ajoute-le à la main :

```bash
claude mcp add --transport http hakoot http://localhost:3000/mcp
```

Avec une clé (serveur distant) :

```bash
claude mcp add --transport http hakoot https://quiz.mondomaine.fr/mcp --header "Authorization: Bearer hk_xxx"
```

La skill `hakoot-quiz` (`.claude/skills/`) donne en plus à Claude des règles de qualité pour écrire les questions.

### Claude Desktop et autres clients stdio

```json
{
  "mcpServers": {
    "hakoot": {
      "command": "node",
      "args": ["C:/chemin/vers/hakoot/mcp/stdio.js"],
      "env": { "HAKOOT_URL": "http://localhost:3000", "HAKOOT_API_KEY": "" }
    }
  }
}
```

### Outils

| Outil | Description |
| --- | --- |
| `create_quiz` | Crée un quiz complet, renvoie `id` et `launchUrl` |
| `validate_quiz` | Vérifie un quiz sans l'enregistrer |
| `list_quizzes` | Liste les quiz du serveur |
| `get_quiz` | Lit un quiz complet |
| `update_quiz` | Modifie titre, description ou remplace les questions |
| `add_questions` | Ajoute des questions à la fin |
| `delete_quiz` | Supprime un quiz |
| `list_live_games` | Parties en cours (PIN, phase, joueurs, top 3) |

Exemple de demande : *« Crée un quiz Hakoot de 10 questions sur la Rome antique, niveau collège »*. Claude renvoie un lien `http://localhost:3000/launch/<id>` : l'ouvrir sur l'ordinateur hôte crée la partie et affiche le code PIN.

## API REST

Base : `http://localhost:3000/api`. Toutes les réponses sont en JSON.

| Méthode | Route | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | non | État du serveur, version |
| `GET` | `/schema` | non | Format des quiz et exemple |
| `GET` | `/quizzes` | oui | Liste (résumés) |
| `POST` | `/quizzes` | oui | Crée un quiz, renvoie `201` |
| `POST` | `/quizzes/validate` | oui | Valide sans enregistrer |
| `GET` | `/quizzes/:id` | oui | Quiz complet |
| `PATCH` | `/quizzes/:id` | oui | Modifie les champs fournis |
| `PUT` | `/quizzes/:id` | oui | Remplace le quiz |
| `POST` | `/quizzes/:id/questions` | oui | Ajoute des questions (`{ "questions": [...] }` ou tableau) |
| `DELETE` | `/quizzes/:id` | oui | Supprime, renvoie `204` |
| `GET` | `/games` | oui | Parties en cours |

Erreurs : `{ "error": "message", "errors": ["détail 1", "détail 2"] }` avec les codes `400`, `401`, `404`, `413`, `429`.

### Exemple

```bash
curl -X POST http://localhost:3000/api/quizzes \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Capitales",
    "questions": [
      { "text": "Capitale du Japon ?", "answers": ["Osaka", "Tokyo", "Kyoto", "Nagoya"], "correct": [1] },
      { "type": "truefalse", "text": "Berne est la capitale de la Suisse.", "correct": true, "timeLimit": 10 }
    ]
  }'
```

Réponse :

```json
{
  "quiz": { "id": "aB3dE5fG", "title": "Capitales", "questions": [ ... ] },
  "links": { "launch": "http://localhost:3000/launch/aB3dE5fG", "api": "http://localhost:3000/api/quizzes/aB3dE5fG" }
}
```

## Format d'un quiz

| Champ | Type | Règles |
| --- | --- | --- |
| `title` | string | obligatoire, 100 caractères max |
| `description` | string | optionnel, 300 max |
| `questions` | tableau | 1 à 100 questions |
| `questions[].type` | `"quiz"` ou `"truefalse"` | défaut `quiz` |
| `questions[].text` | string | obligatoire, 200 max |
| `questions[].answers` | tableau | quiz : 2 à 4 réponses (90 max), chaînes ou `{ "text", "correct": true }` |
| `questions[].correct` | tableau d'indices, indice, ou booléen | quiz : `[1]` ou `[0, 2]`. truefalse : `true` (Vrai) ou `false` (Faux) |
| `questions[].timeLimit` | nombre | arrondi à 5, 10, 20, 30, 45, 60, 90, 120 ou 240 (défaut 20) |
| `questions[].points` | nombre ou texte | `0`, `1000`, `2000` ou `"none"`, `"standard"`, `"double"` |
| `questions[].image` | string | URL `http(s)` optionnelle |

Le score d'une bonne réponse vaut `points × (1 − temps / limite / 2)` arrondi, plus un bonus de série de 100 par bonne réponse consécutive (plafonné à 500).
