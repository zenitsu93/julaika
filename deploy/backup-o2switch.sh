#!/bin/sh
# Sauvegarde des comptes et des albums julaïka vers l'hébergement o2switch.
#
# Ce qui part : une copie cohérente de julaika.db (faite pendant que le jeu tourne) et le dossier
# album/ (une image .webp par fichier). rsync n'envoie que les nouvelles images : après la première
# nuit, la sauvegarde ne prend que quelques secondes.
#
# Mise en place, une fois, sur le VPS :
#   1. cPanel o2switch > « Autorisation SSH » : ajouter l'adresse IP du VPS.
#   2. ssh-keygen -t ed25519 -f ~/.ssh/o2switch -N ''   puis coller ~/.ssh/o2switch.pub dans
#      cPanel > « Accès SSH » > « Gérer les clés SSH » > Importer, et l'autoriser.
#   3. Dans ~/julaika/.env : O2_SSH=identifiant@serveur.o2switch.net (et O2_DIR si besoin).
#   4. crontab -e :
#        15 4 * * * ~/julaika/deploy/backup-o2switch.sh >> ~/julaika-backup.log 2>&1
#
# Restaurer : arrêter le jeu, recopier julaika.db et album/ dans le volume julaika-data, relancer.
set -eu

cd "$(dirname "$0")/.."
[ -f .env ] && . ./.env
: "${O2_SSH:?définis O2_SSH=identifiant@serveur.o2switch.net dans .env}"
O2_DIR="${O2_DIR:-sauvegardes/julaika}"
KEY="${O2_KEY:-$HOME/.ssh/o2switch}"
SSH="ssh -i $KEY -o BatchMode=yes -o StrictHostKeyChecking=accept-new"

# Le volume Docker appartient à root : sudo pour le lire si besoin.
SUDO=$([ "$(id -u)" = 0 ] || echo sudo)
VOL=$(docker volume inspect julaika-data --format '{{ .Mountpoint }}')
STAMP=$(date +%Y-%m-%d)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Copie cohérente de la base, même en pleine partie (VACUUM INTO lit une photo instantanée).
docker exec julaika node --disable-warning=ExperimentalWarning -e "
  const { DatabaseSync } = require('node:sqlite');
  new DatabaseSync('/app/data/julaika.db').exec(\"VACUUM INTO '/app/data/sauvegarde.db'\");
"
docker cp julaika:/app/data/sauvegarde.db "$TMP/julaika-$STAMP.db"
docker exec julaika rm -f /app/data/sauvegarde.db

$SSH "$O2_SSH" "mkdir -p '$O2_DIR/base' '$O2_DIR/album'"
# Les images : seulement les nouvelles, et celles effacées d'un album le sont aussi là-bas.
$SUDO rsync -a --delete -e "$SSH" "$VOL/album/" "$O2_SSH:$O2_DIR/album/"
# La base : une copie par jour, on garde les 14 dernières.
rsync -a -e "$SSH" "$TMP/julaika-$STAMP.db" "$O2_SSH:$O2_DIR/base/"
$SSH "$O2_SSH" "ls -1t '$O2_DIR'/base/julaika-*.db | tail -n +15 | xargs -r rm -f"

echo "$(date '+%F %T') sauvegarde envoyée vers $O2_SSH:$O2_DIR"
