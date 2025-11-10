#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Build and push Sim Docker images.

Usage:
  ./scripts/build-and-push-images.sh --registry REGISTRY --tag TAG

Environment overrides:
  REGISTRY, TAG

Images produced:
  REGISTRY/sim-simstudio:TAG    (docker/app.Dockerfile)
  REGISTRY/sim-realtime:TAG     (docker/realtime.Dockerfile)
  REGISTRY/sim-migrations:TAG   (docker/db.Dockerfile)
USAGE
}

REGISTRY="${REGISTRY:-}"
TAG="${TAG:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -r|--registry)
      REGISTRY="$2"; shift 2 ;;
    -t|--tag)
      TAG="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$REGISTRY" || -z "$TAG" ]]; then
  echo "Error: REGISTRY and TAG are required." >&2
  usage
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker is not installed or not in PATH" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

build_push() {
  local name="$1" dockerfile="$2" context="$3"
  local ref="${REGISTRY}/${name}:${TAG}"

  echo "\n=== Building ${ref} (Dockerfile: ${dockerfile}) ===" | sed 's/\\n/\n/g'
  DOCKER_BUILDKIT=1 docker build -f "${dockerfile}" -t "${ref}" "${context}"

  echo "\n=== Pushing ${ref} ===" | sed 's/\\n/\n/g'
  docker push "${ref}"
}

cd "${REPO_ROOT}"

build_push "sim-simstudio"  "docker/app.Dockerfile"       "."
build_push "sim-realtime"    "docker/realtime.Dockerfile"  "."
build_push "sim-migrations"  "docker/db.Dockerfile"        "."

echo "\nAll images built and pushed successfully." | sed 's/\\n/\n/g'



