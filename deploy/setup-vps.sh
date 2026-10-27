#!/usr/bin/env bash
# Installation sur un VPS Ubuntu/Debian neuf, à lancer en root :
#   curl -fsSL https://raw.githubusercontent.com/zenitsu93/julaika/<branche>/deploy/setup-vps.sh | DOMAIN=jeu.exemple.com bash
set -euo pipefail
: "${DOMAIN:?définis DOMAIN, ex. DOMAIN=jeu.exemple.com}"
BRANCH="${BRANCH:-claude/project-thread-ojgww0}"
DIR=/opt/julaika

command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
command -v git >/dev/null || (apt-get update && apt-get install -y git)

if command -v ufw >/dev/null && ufw status | grep -q active; then
  ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
fi

if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch origin "$BRANCH" && git -C "$DIR" checkout -B "$BRANCH" "origin/$BRANCH"
else
  git clone --branch "$BRANCH" https://github.com/zenitsu93/julaika.git "$DIR"
fi

cd "$DIR"
echo "DOMAIN=$DOMAIN" > .env
docker compose up -d --build
echo "OK : https://$DOMAIN (le certificat peut prendre une minute)"
