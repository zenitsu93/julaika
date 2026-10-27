#!/bin/sh
# Mise à jour du serveur : lancé par la CI (clé SSH avec command="…/deploy/deploy.sh",restrict)
# ou à la main : ~/julaika/deploy/deploy.sh
set -eu
cd "$(dirname "$0")/.."

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
echo "[deploy] Récupération de $BRANCH"
git fetch --quiet origin "$BRANCH"
git merge --ff-only --quiet "origin/$BRANCH"
git log -1 --format='[deploy] Version %h : %s'

docker compose up -d --build --remove-orphans --wait --wait-timeout 180
docker image prune -f >/dev/null
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
echo "[deploy] Terminé"
