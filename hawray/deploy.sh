#!/usr/bin/env bash
# Replace the running Gladys container with a custom image.
# Usage: hawray/deploy.sh [image]         (default: gladys-hawray:latest)
#
# 1. backs up /var/lib/gladysassistant to ~/gladys-backups/ while Gladys is stopped
# 2. keeps the current container, stopped, as "gladys-previous" (for hawray/rollback.sh)
# 3. starts the new container with the same options, opted out of Watchtower
set -euo pipefail
source "$(dirname "$0")/lib.sh"

IMAGE="${1:-gladys-hawray:latest}"
BACKUPS="${BACKUPS:-$HOME/gladys-backups}"

docker image inspect "$IMAGE" >/dev/null

echo "Stopping $GLADYS_NAME"
docker stop "$GLADYS_NAME" >/dev/null

STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUPS"
docker run --rm --entrypoint tar -v "$GLADYS_DATA:/data:ro" -v "$BACKUPS:/backup" "$IMAGE" \
  czf "/backup/gladysassistant-$STAMP.tar.gz" -C /data .
echo "Backup: $BACKUPS/gladysassistant-$STAMP.tar.gz"

# Only one previous container is kept: the one we are replacing now.
if docker container inspect "$GLADYS_PREVIOUS" >/dev/null 2>&1; then
  docker rm "$GLADYS_PREVIOUS" >/dev/null
fi
docker rename "$GLADYS_NAME" "$GLADYS_PREVIOUS"
# Stopped containers with restart=always come back when the Docker daemon restarts:
# make sure the old one stays down after a reboot.
docker update --restart=no "$GLADYS_PREVIOUS" >/dev/null

docker run "${GLADYS_RUN_ARGS[@]}" \
  --label com.centurylinklabs.watchtower.enable=false \
  "$IMAGE" >/dev/null
echo "Started $GLADYS_NAME on $IMAGE (previous container kept as $GLADYS_PREVIOUS)"

wait_for_gladys || { echo "Roll back with: hawray/rollback.sh" >&2; exit 1; }
