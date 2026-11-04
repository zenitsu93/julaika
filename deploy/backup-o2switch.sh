#!/bin/sh
# Sauvegarde des comptes et des albums julaïka vers l'hébergement o2switch.
#
# Ce qui part : une copie cohérente de julaika.db (faite pendant que le jeu tourne) et le dossier
# album/ (une image .webp par fichier). rsync n'envoie que les nouvelles images : après la première
# nuit, la sauvegarde ne prend que quelques secondes. Une image retirée d'un album n'est pas effacée
# tout de suite là-bas : elle passe dans album-retirees/<date>/ et y reste 14 jours, comme les copies
# de la base. Un volume vidé par erreur ne vide donc pas la sauvegarde.
#
# Mise en place, une fois, sur le VPS :
#   1. Une clé SSH acceptée par o2switch (cPanel > « Accès SSH » > « Gérer les clés SSH ») et l'IP du
#      VPS dans cPanel > « Autorisation SSH ». Sur le VPS actuel, c'est fait : ~/.ssh/o2switch_backup,
#      déclarée pour o2switch dans ~/.ssh/config (O2_KEY=chemin pour en imposer une autre).
#   2. Dans ~/julaika/.env : O2_SSH=identifiant@serveur (et O2_DIR, par défaut sauvegardes-julaika).
#   3. crontab -e :
#        15 4 * * * $HOME/julaika/deploy/backup-o2switch.sh >> $HOME/sauvegardes/julaika.log 2>&1
#
# Restaurer : arrêter le jeu, recopier julaika.db et album/ dans /app/data du conteneur (docker cp,
# puis propriétaire node), relancer.
set -eu
umask 077

cd "$(dirname "$0")/.."
# Seules les lignes O2_* de .env : le reste n'est pas forcément lisible par le shell.
lire() { if [ -f .env ]; then sed -n "s/^$1=//p" .env | tail -n 1; fi; }
O2_SSH="${O2_SSH:-$(lire O2_SSH)}"
O2_DIR="${O2_DIR:-$(lire O2_DIR)}"
O2_KEY="${O2_KEY:-$(lire O2_KEY)}"
: "${O2_SSH:?définis O2_SSH=identifiant@serveur dans .env}"
O2_DIR="${O2_DIR:-sauvegardes-julaika}"
SSH="ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new${O2_KEY:+ -i $O2_KEY}"
STAMP=$(date +%Y-%m-%d)

# Le volume Docker n'est lisible que par root : tout passe par le conteneur (docker cp garde les
# dates des fichiers, rsync reconnaît donc les images déjà envoyées). Sur disque plutôt que dans
# /tmp, qui est en mémoire sur le VPS.
TMP=$(mktemp -d "$HOME/.julaika-sauvegarde.XXXXXX")
trap 'rm -rf "$TMP"' EXIT

# Copie cohérente de la base, même en pleine partie (VACUUM INTO lit une photo instantanée).
docker exec julaika node --disable-warning=ExperimentalWarning -e "
  const fs = require('node:fs');
  if (!fs.existsSync('/app/data/julaika.db')) { console.error('pas encore de julaika.db'); process.exit(1); }
  fs.rmSync('/app/data/sauvegarde.db', { force: true });
  const { DatabaseSync } = require('node:sqlite');
  new DatabaseSync('/app/data/julaika.db').exec(\"VACUUM INTO '/app/data/sauvegarde.db'\");
"
docker cp -q julaika:/app/data/sauvegarde.db "$TMP/julaika-$STAMP.db"
docker exec julaika rm -f /app/data/sauvegarde.db

mkdir "$TMP/album"
if docker exec julaika sh -c 'test -d /app/data/album'; then
  docker cp -q julaika:/app/data/album/. "$TMP/album/"
fi

RSYNC="rsync -a --chmod=D700,F600 -e"
$SSH "$O2_SSH" "mkdir -p '$O2_DIR/base' '$O2_DIR/album'"
$RSYNC "$SSH" --delete --backup --backup-dir="../album-retirees/$STAMP" "$TMP/album/" "$O2_SSH:$O2_DIR/album/"
$RSYNC "$SSH" "$TMP/julaika-$STAMP.db" "$O2_SSH:$O2_DIR/base/"
# On garde 14 copies de la base et 14 jours d'images retirées.
$SSH "$O2_SSH" "cd '$O2_DIR' && ls -1t base/julaika-*.db | tail -n +15 | xargs -r rm -f;
  [ -d album-retirees ] && find album-retirees -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +; true"

echo "$(date '+%F %T') sauvegarde envoyée vers $O2_SSH:$O2_DIR : base $(du -h "$TMP/julaika-$STAMP.db" | cut -f1), $(find "$TMP/album" -type f | wc -l) images"
