---
name: hakoot-quiz
description: Create, improve or manage Hakoot quizzes through the Hakoot MCP server or REST API. Use when the user asks for a quiz, questions on a topic, a trivia game, or to edit/launch a Hakoot quiz.
---

# Créer des quiz Hakoot

Hakoot est un quiz multijoueur en direct. Le serveur doit tourner (`npm start`, http://localhost:3000).

## Outils

Utilise en priorité les outils MCP `hakoot` :

- `create_quiz` : crée un quiz complet en un seul appel, renvoie `launchUrl`
- `add_questions`, `update_quiz`, `get_quiz`, `list_quizzes`, `delete_quiz`
- `validate_quiz` : vérifie sans enregistrer
- `list_live_games` : parties en cours

Sans MCP, utilise l'API REST : `POST http://localhost:3000/api/quizzes` (voir docs/API.md).

## Règles de qualité

1. Vérifie chaque fait. En cas de doute sur une réponse, reformule ou change de question.
2. 4 réponses par question de type quiz, courtes (moins de 40 caractères idéalement, 90 max), toutes plausibles, de longueur et de forme proches.
3. Une seule bonne réponse sauf demande contraire. Varie la position de la bonne réponse.
4. Énoncé clair, moins de 120 caractères idéalement (200 max), sans ambiguïté ni négation piège.
5. Mélange 1 question vrai/faux pour 4 à 5 questions quiz si cela convient au sujet.
6. Difficulté progressive. Mets `points: 2000` sur 1 ou 2 questions finales difficiles.
7. `timeLimit` : 10 s pour les questions très courtes, 20 s par défaut, 30 s si l'énoncé est long.
8. Langue : celle de l'utilisateur.

## Format

```json
{
  "title": "Le système solaire",
  "description": "10 questions, niveau facile à moyen",
  "questions": [
    { "type": "quiz", "text": "Quelle est la plus grande planète ?", "answers": ["Saturne", "Jupiter", "Neptune", "Uranus"], "correct": [1] },
    { "type": "truefalse", "text": "Vénus est plus chaude que Mercure.", "correct": true, "timeLimit": 10 }
  ]
}
```

## Après la création

Donne à l'utilisateur le titre, le nombre de questions et le lien `launchUrl` : l'ouvrir sur l'ordinateur hôte lance directement la partie avec son code PIN et son QR code.
