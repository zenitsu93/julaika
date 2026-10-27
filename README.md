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

## Déployer

Production : VPS OVH, derrière le Caddy de la pile `2nb-prospect` (seul à écouter sur 80/443).

1. DNS (cPanel o2switch > Zone Editor) : `julaika` en `A` vers l'IP du VPS.
2. Sur le VPS : cloner le dépôt dans `~/julaika`, puis `deploy/deploy.sh` (construit l'image et
   lance le conteneur `julaika` sur le réseau `2nb-prospect_frontend`).
3. Copier `deploy/julaika.caddy` dans `~/caddy-sites/` et recharger Caddy (commande dans le fichier).
4. CI/CD : chaque push sur la branche par défaut déploie via `.github/workflows/ci.yml`, une fois
   `VPS_HOST`, `VPS_USER` (variables) et `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS` (secrets) renseignés.
   La clé est déclarée sur le serveur avec `command="/home/christian/julaika/deploy/deploy.sh",restrict`.

VPS neuf sans autre site : `DOMAIN=jeu.exemple.com docker compose -f docker-compose.standalone.yml up -d --build`
(Caddy inclus, HTTPS automatique). Avec nginx à la place : `deploy/nginx.conf`.
