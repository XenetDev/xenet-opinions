#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
[ "$#" -gt 0 ] || set -- up -d
exec docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.mock.yml --env-file "${XO_ENV_FILE:-.env.selfhost}" "$@"
