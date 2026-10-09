#!/usr/bin/env bash
# Undo a deploy.
# Usage: hawray/rollback.sh               restore the container kept by the last deploy
#        hawray/rollback.sh --official    recreate Gladys from the official image
#                                         (Watchtower updates it again)
set -euo pipefail
source "$(dirname "$0")/lib.sh"

if [ "${1:-}" = "--official" ]; then
  docker pull "$GLADYS_OFFICIAL_IMAGE"
  docker rm -f "$GLADYS_NAME" >/dev/null 2>&1 || true
  docker run "${GLADYS_RUN_ARGS[@]}" "$GLADYS_OFFICIAL_IMAGE" >/dev/null
  echo "Started $GLADYS_NAME on $GLADYS_OFFICIAL_IMAGE"
else
  docker container inspect "$GLADYS_PREVIOUS" >/dev/null
  docker rm -f "$GLADYS_NAME" >/dev/null 2>&1 || true
  docker rename "$GLADYS_PREVIOUS" "$GLADYS_NAME"
  docker update --restart=always "$GLADYS_NAME" >/dev/null
  docker start "$GLADYS_NAME" >/dev/null
  echo "Restored the previous $GLADYS_NAME container"
fi

wait_for_gladys
