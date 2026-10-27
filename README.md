# julaika

Jeu de dessin et de devinettes multijoueur en temps réel, inspiré de skribbl.io, en plus léger.

## Démarrer

```bash
pnpm install
pnpm dev          # client sur http://localhost:5173, serveur WebSocket sur :3001
pnpm test         # tests de la logique de jeu et du protocole
pnpm build && pnpm start   # un seul process sur :3001 (client + WebSocket)
```

## Architecture

```
packages/shared   protocole (types JSON, encodage binaire du dessin, remplissage, comparaison des réponses)
apps/server       Node + ws : salons, boucle de jeu autoritaire, minuteurs, scores, relais du dessin
apps/client       React 19 + Vite + Tailwind 4 : canvas 2D, chat, overlays de phase
tests             Vitest
```

Choix qui rendent le jeu plus léger que l'original :

- **Dessin en binaire** : 4 octets d'en-tête + 4 octets par point (Uint16), couleur et taille en index.
  Environ 6× moins de données qu'en JSON. Le serveur relaie le paquet sans le réencoder.
- **Envoi groupé par frame** : les points (y compris `getCoalescedEvents`) partent au plus une fois
  par `requestAnimationFrame`.
- **Minuteurs côté serveur, compte à rebours côté client** : le serveur envoie une échéance
  (`endsAt`) et non un tick par seconde ; le client corrige le décalage d'horloge avec `ping`.
- **Historique des traits** gardé par le serveur pour les joueurs qui arrivent en cours de tour,
  et pour l'annulation.
- **Store sans dépendance** (`useSyncExternalStore` + sélecteurs) : seuls les composants concernés
  se re-rendent.
- Limitation de débit par connexion (chat et dessin), heartbeat pour couper les sockets mortes.

## Boucle de jeu

`lobby` → `choosing` (le dessinateur choisit parmi N mots, 15 s) → `drawing` (indices révélés
dans la seconde moitié) → `turnEnd` (mot + points, 6 s) → dessinateur suivant… → `gameEnd` → `lobby`.

Points : le devineur gagne 50 à 500 selon sa rapidité (+ bonus aux premiers), le dessinateur gagne
selon la part des joueurs qui ont trouvé. Les réponses ignorent casse et accents ; une réponse à une
lettre près affiche « tu chauffes ». Ceux qui ont trouvé discutent entre eux sans spoiler.

## Thème

Concept « Néon Arcade ». Les couleurs sont des variables dans `apps/client/src/index.css` (`@theme`) :
changer de concept se fait essentiellement là.

## Déployer sur un VPS

Prérequis : un VPS Ubuntu/Debian, un (sous-)domaine dont l'enregistrement A pointe vers son IP.

```bash
# sur le VPS, en root
DOMAIN=jeu.exemple.com bash deploy/setup-vps.sh
```

Le script installe Docker, clone le dépôt dans `/opt/julaika` et lance `docker compose` :
le conteneur du jeu (client + WebSocket sur un seul port) derrière Caddy, qui gère HTTPS
(Let's Encrypt) et les WebSockets. Mettre à jour : relancer le même script.
Si nginx tourne déjà sur le VPS, voir `deploy/nginx.conf`.
