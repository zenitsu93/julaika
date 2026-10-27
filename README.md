<p align="center">
  <img src="docs/brand/cover.png" alt="julaïka : dessine, devine, marque des points" width="100%" />
</p>

<p align="center">
  <b>Jeu de dessin et de devinettes multijoueur en temps réel.</b><br />
  Inspiré de skribbl.io, en plus léger. Dans le navigateur, sans compte.
</p>

<p align="center">
  <a href="https://julaika.2nbdigital.com"><b>Jouer</b></a> ·
  <a href="#démarrer">Démarrer en local</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#déployer">Déployer</a>
</p>

<p align="center">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-18181b?logo=react&logoColor=f5b700" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-18181b?logo=typescript&logoColor=f5b700" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-Tailwind%204-18181b?logo=vite&logoColor=f5b700" />
  <img alt="Node + ws" src="https://img.shields.io/badge/Node-ws-18181b?logo=nodedotjs&logoColor=f5b700" />
  <img alt="Tests Vitest" src="https://img.shields.io/badge/tests-Vitest-18181b?logo=vitest&logoColor=f5b700" />
</p>

## En bref

- **Crée un salon, partage le lien** : les amis arrivent directement dans la partie, sans inscription.
- **Un dessinateur, les autres devinent** dans le chat ; plus tu trouves vite, plus tu marques.
- **Visio intégrée** sous le dessin pour se voir et s'entendre pendant la partie.
- **Léger** : dessin encodé en binaire, un seul process Node pour le client et le WebSocket.
- **Thème clair et sombre** qui suit le système, raccourcis clavier pour tout.

## Démarrer

```bash
pnpm install
pnpm dev          # client sur http://localhost:5173, serveur WebSocket sur :3001 (lit .env)
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

## Mots et difficulté

L'hôte choisit la difficulté dans le salon : **facile** (objets et animaux du quotidien), **moyen**
(objets moins courants, métiers, mots composés) ou **difficile** (scènes, actions, expressions).

Avec `DEEPSEEK_API_KEY` dans `.env`, les mots sont inventés par DeepSeek (`deepseek-flash`, sans
réflexion, environ 2 s par lot de 30). Chaque salon commande un lot dès qu'il a deux joueurs, puis en
recommande quand il lui reste moins de trois tours, en donnant les mots déjà sortis à éviter. Un tour
n'attend jamais l'API. Le modèle range ses mots dans les trois niveaux à la fois (on ne garde que celui
demandé) : il calibre mieux en comparant. Sans clé, si l'API échoue ou si le premier lot n'est pas
encore arrivé, le jeu tire dans les listes intégrées de la même difficulté (`apps/server/src/words.ts`).

Garde-fous : 60 appels par heure au plus pour tout le serveur, une minute de pause après une erreur,
mots filtrés (lettres, espaces, tirets et apostrophes, 4 mots et 30 caractères au plus). Variables
facultatives : `DEEPSEEK_MODEL` et `DEEPSEEK_BASE_URL`.

## Visio

**Intégrée (sous le dessin)** : WebRTC en maillage pair à pair jusqu'à 8 personnes, vidéo 320×240
à 15 i/s plafonnée à 250 kb/s par flux. La signalisation passe par le WebSocket du jeu ; seul le
joueur à l'identifiant le plus petit initie chaque connexion, et couper la caméra remplace la piste
sans renégocier. STUN public par défaut ; pour les NAT stricts (4G, entreprise), activer le relais
coturn décrit dans `deploy/turnserver.conf` (identifiants temporaires dérivés de `TURN_SECRET`).

**Google Meet** (optionnel) :

Meet refuse d'être intégré dans une page (iframe bloquée), donc l'hôte crée une réunion sur
meet.google.com/new et colle son lien via « Google Meet ». Le lien est validé côté serveur
(uniquement `https://meet.google.com/xxx-xxxx-xxx`) et chaque joueur voit « Ouvrir Google Meet ».

## Thème

Concept « Studio Pro » : tableau au centre, joueurs en pastilles au-dessus, dock flottant,
thème clair et sombre selon le système. Raccourcis : `1`–`5` choisir le mot, `B`/`E`/`F` outils,
`Ctrl+Z` annuler, `/` ou `Entrée` aller au chat. Les couleurs sont des variables dans
`apps/client/src/index.css` (`@theme`) : changer de concept se fait essentiellement là.

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

## Identité

Le nom s'écrit **julaïka**, avec un i tréma. Sans accent (`julaika`), il reste réservé au code, aux paquets, aux clés et au domaine.

Le logo « crayon-J » : un crayon forme la barre du J, et le trait qu'il vient de tracer en dessine la boucle.
Les fichiers sont dans [`docs/brand`](docs/brand) : `logo.svg` (fond clair), `logo-dark.svg` (fond sombre),
`mark.svg` (picto seul) et `cover.png`. Le picto est aussi un composant React (`apps/client/src/components/Logo.tsx`)
dont le corps suit la couleur du texte. Favicon, icônes d'appli, manifest et image d'aperçu pour les réseaux
(`og-image.png`, 1200×630) sont dans `apps/client/public`.

| Rôle | Couleur |
| --- | --- |
| Encre (thème clair) | `#18181b` |
| Encre (thème sombre) | `#fafafa` |
| Accent crayon | `#f5b700` |

Police : Instrument Sans (lettrage en 600, approche serrée).
