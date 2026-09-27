#!/usr/bin/env bash
# Start PostgreSQL 18 for a CI job, on localhost:5432 with database
# diagramatix_test — what the `services:` container used to provide.
#
# WHY NOT A SERVICE CONTAINER. A service's image is pulled from ONE registry,
# and every public registry rations anonymous pulls per runner IP, which GitHub
# shares between strangers:
#   - Docker Hub: "toomanyrequests" rate limit — why CI moved to AWS's mirror;
#   - AWS ECR Public: "toomanyrequests: Data limit exceeded" — the e2e job
#     failed on both pushes of 2026-09-27, so both deploys were skipped.
# Here each registry is tried in turn, a few times each, so one exhausted
# quota costs a retry instead of a deploy.
#
# Production runs PostgreSQL 18; matching the major version catches
# version-specific SQL the same way prod would. POSTGRES_DB creates the test
# database up front — globalSetup runs `prisma db push`, not CREATE DATABASE.
set -u

IMAGES=(
  "public.ecr.aws/docker/library/postgres:18"   # AWS mirror of the official image
  "mirror.gcr.io/library/postgres:18"           # Google's Docker Hub mirror
  "docker.io/library/postgres:18"               # Docker Hub itself
)

got=""
for img in "${IMAGES[@]}"; do
  for attempt in 1 2 3; do
    if docker pull --quiet "$img"; then got="$img"; break 2; fi
    echo "::warning::could not pull $img (attempt $attempt of 3)"
    sleep $((attempt * 5))
  done
done
if [ -z "$got" ]; then
  echo "::error::could not pull postgres:18 from any registry: ${IMAGES[*]}"
  exit 1
fi
echo "Using $got"

docker run -d --name ci-postgres -p 5432:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=diagramatix_test \
  "$got" >/dev/null

# Ready = accepting TCP. The image's first start runs a temporary server on the
# Unix socket only while it creates the database, then restarts; asking over
# 127.0.0.1 waits for the real one.
for _ in $(seq 1 90); do
  if docker exec ci-postgres pg_isready -h 127.0.0.1 -U postgres -d diagramatix_test >/dev/null 2>&1; then
    echo "PostgreSQL 18 is ready on localhost:5432"
    exit 0
  fi
  sleep 1
done
echo "::error::PostgreSQL did not become ready in 90 seconds"
docker logs ci-postgres
exit 1
