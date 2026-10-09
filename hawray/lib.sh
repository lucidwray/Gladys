# Shared settings for the hawray build/deploy scripts. Sourced, not executed.

GLADYS_NAME=gladys
GLADYS_PREVIOUS=gladys-previous
GLADYS_DATA=/var/lib/gladysassistant
GLADYS_OFFICIAL_IMAGE=gladysassistant/gladys:v5

# Same options as the official container on the home server (captured with
# `docker inspect gladys` on 2026-10-09). Never add GLADYS_OFFICIAL_RELEASE_IMAGE
# here: see docker/Dockerfile.buildx.
GLADYS_RUN_ARGS=(
  -d --name "$GLADYS_NAME"
  --restart=always --privileged --network=host --cgroupns=host
  --log-driver json-file --log-opt max-size=10m
  -e NODE_ENV=production -e SERVER_PORT=80 -e TZ=America/New_York
  -e SQLITE_FILE_PATH="$GLADYS_DATA/gladys-production.db"
  -v /var/run/docker.sock:/var/run/docker.sock
  -v "$GLADYS_DATA:$GLADYS_DATA"
  -v /dev:/dev -v /run/udev:/run/udev:ro -v /run/dbus:/run/dbus:ro
)

wait_for_gladys() {
  for _ in $(seq 1 90); do
    if curl -fsS http://localhost/api/v1/ping >/dev/null 2>&1; then
      echo "Gladys is answering on http://localhost/"
      return 0
    fi
    sleep 2
  done
  echo "Gladys did not answer /api/v1/ping within 3 minutes. Check: docker logs $GLADYS_NAME" >&2
  return 1
}
