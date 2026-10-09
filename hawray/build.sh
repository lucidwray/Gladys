#!/usr/bin/env bash
# Build the custom Gladys image on the home server, from a clone of lucidwray/Gladys.
# Usage: hawray/build.sh [git-ref]        (default: origin/hawray)
# Produces gladys-hawray:<short-sha> and gladys-hawray:latest.
set -euo pipefail

REF="${1:-origin/hawray}"
IMAGE="${IMAGE:-gladys-hawray}"

cd "$(dirname "$0")/.."
git fetch --quiet origin
git checkout --quiet --detach "$REF"
SHA="$(git rev-parse --short HEAD)"
echo "Building $IMAGE from $REF ($SHA)"

# Front: same steps as .github/workflows/docker-dev-build.yml (npm ci + npm run build),
# in a throwaway node:24 container so the server needs no Node install.
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD/front:/front" -w /front node:24 sh -c 'npm ci && npm run build'

# docker/Dockerfile.buildx expects the built front in ./static
rm -rf static
cp -R front/build static

# No --build-arg: GLADYS_OFFICIAL_RELEASE_IMAGE must keep its default (false).
docker build -f docker/Dockerfile.buildx -t "$IMAGE:$SHA" -t "$IMAGE:latest" .

echo "Built $IMAGE:$SHA (also tagged $IMAGE:latest)"
