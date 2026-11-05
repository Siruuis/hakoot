# Hakoot!

**Le quiz multijoueur qui fait du bruit.** L'hôte projette les questions sur grand écran, les joueurs répondent depuis leur téléphone avec un code PIN. Open source, auto-hébergé, sans compte, sans pub.

![Lobby](docs/screenshots/05-host-lobby.png)

| Question | Résultats | Podium |
| --- | --- | --- |
| ![Question](docs/screenshots/08-host-question.png) | ![Résultats](docs/screenshots/11-host-reveal.png) | ![Podium](docs/screenshots/15-host-podium.png) |

| Accueil (mobile) | Réponse (mobile) | Bonne réponse (mobile) |
| --- | --- | --- |
| ![Accueil](docs/screenshots/00-home.png) | ![Réponse](docs/screenshots/09-player-question.png) | ![Correct](docs/screenshots/12-player-correct.png) |

## Fonctionnalités

- **Éditeur de quiz** : questions à 2-4 réponses (une ou plusieurs bonnes) ou vrai/faux, image par URL, chrono de 5 s à 4 min, points standard, doublés ou nuls. Sauvegarde automatique dans le navigateur, import/export JSON.
- **Lobby** : code PIN à 6 chiffres, QR code, choix de l'adresse réseau, exclusion d'un joueur, verrouillage de la partie.
- **Partie en direct** : annonce de la question, chrono synchronisé, fin anticipée quand tout le monde a répondu, graphique des réponses, classement, podium animé.
- **Score** : jusqu'à 1000 points selon la rapidité, plus un bonus de série (jusqu'à +500).
- **Robuste** : reconnexion automatique des joueurs et de l'hôte (même après un rechargement de page), serveur autoritaire (la bonne réponse n'est jamais envoyée aux joueurs avant la fin du chrono).
- **Export** des résultats en CSV (compatible Excel).

## Démarrage rapide

Prérequis : [Node.js](https://nodejs.org) 20.19 ou plus récent.

```bash
git clone https://github.com/Siruuis/hakoot.git
cd hakoot
npm install
npm run build
npm start
```

Ouvre `http://localhost:3000/create`, lance un quiz, puis fais scanner le QR code aux joueurs (ils doivent être sur le même réseau Wi-Fi). Le port se change avec la variable d'environnement `PORT`.

> Sous Windows, autorise Node.js dans le pare-feu (réseau privé) au premier lancement, sinon les téléphones ne pourront pas se connecter.

## Développement

```bash
npm run dev    # serveur (port 3000) + Vite avec rechargement à chaud (port 5173)
npm test       # tests de bout en bout du moteur de jeu
```

## Architecture

```
server/   Express + Socket.IO, moteur de jeu (phases, chrono, score)
shared/   validation des quiz, partagée client/serveur
src/      client React (Vite) : accueil, éditeur, écran hôte, écran joueur
test/     tests de bout en bout (vraies connexions Socket.IO)
```

Les parties vivent en mémoire côté serveur ; les quiz sont stockés dans le `localStorage` de l'hôte.

### Format d'import JSON

```json
{
  "title": "Mon quiz",
  "description": "",
  "questions": [
    {
      "type": "quiz",
      "text": "Quelle est la capitale de l'Australie ?",
      "image": "",
      "answers": ["Sydney", "Canberra", "Melbourne", "Perth"],
      "correct": [1],
      "timeLimit": 20,
      "points": 1000
    }
  ]
}
```

`type` : `quiz` ou `truefalse` · `timeLimit` : 5, 10, 20, 30, 45, 60, 90, 120 ou 240 · `points` : 0, 1000 ou 2000.

## Contribuer

Les issues et pull requests sont les bienvenues. Lance `npm test` et `npm run build` avant de proposer une modification.

## Licence

[MIT](LICENSE)
