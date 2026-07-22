# syntax=docker/dockerfile:1.7
#
# Diagramatix production image — multi-stage build for Next.js 16 + Prisma 7.
#
# Stages:
#   1. deps    — install Node deps + run `prisma generate` (Prisma 7 emits
#                client code to `app/generated/prisma`, which is then
#                bundled by `next build`).
#   2. builder — copy full source, bake the commit count, run `next build`.
#   3. runner  — slim runtime: only the Next.js standalone tree, static
#                assets, `public/` (BPMN stencils + ArchiMate JSON read at
#                runtime), and the Prisma schema (so prisma migrate deploy
#                can be invoked separately from CI before swap).
#
# Node 20 LTS sidesteps the Node 24 / Turbopack issue we hit locally.
# Alpine base keeps the image ~150 MB instead of ~600 MB on Debian slim.

# ─── Stage 1: deps ─────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Prisma 7 needs OpenSSL on Alpine to run the query engine at build time
# (its `prisma generate` step links against system OpenSSL). libc6-compat
# is the standard companion for native modules shipped as glibc binaries.
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma
# `npm ci` is reproducible against the lockfile and skips the
# package.json-resolution step `npm install` performs. `--ignore-scripts`
# defers Prisma's postinstall to the explicit `npx prisma generate`
# below — otherwise it runs twice.
RUN npm ci --ignore-scripts

# Generate the Prisma 7 client into app/generated/prisma/. This is what
# every server/edge import of `@prisma/client` resolves through; without
# this step `next build` would fail to type-check the imports.
RUN npx prisma generate

# ─── Stage 2: builder ──────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

# Surface a single build-arg for the commit count so the source code can
# read it via `process.env.NEXT_PUBLIC_COMMIT_COUNT` at build time (this
# replaces the 5× `execSync("git rev-list --count HEAD")` calls — see P0.5).
# Pass it from CI:  --build-arg GIT_COMMIT_COUNT=$(git rev-list --count HEAD)
ARG GIT_COMMIT_COUNT=0
ENV NEXT_PUBLIC_COMMIT_COUNT=${GIT_COMMIT_COUNT}

# Pull node_modules (including the freshly-generated Prisma client at
# app/generated/prisma/ — note: that lives under app/, not node_modules/,
# so it comes in with the source copy below).
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/app/generated ./app/generated
COPY . .

# Telemetry adds startup time + an outbound call; opt out in CI builds.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage 3: runner ───────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# OpenSSL for the Prisma query engine at runtime. libc6-compat for any
# native modules that ship glibc binaries (pg's native bindings, bcryptjs
# fallbacks, etc.). ffmpeg for the SuperAdmin Screencast Studio server-side
# transcode (webm→mp4) — see app/api/video/transcode.
RUN apk add --no-cache libc6-compat openssl ffmpeg

# Run as an unprivileged user. UID 1001 / GID 1001 follows the upstream
# Next.js Docker example so log analyzers that expect it work unchanged.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next.js standalone output: ships server.js + minimal node_modules + the
# traced files from app/. Static assets and public/ are NOT included in
# the trace and must be copied separately.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# public/ holds the BPMN stencils, ArchiMate symbol JSON, and the v1.5
# template/stencil files read at runtime by the Visio export route.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Prisma schema is needed if we ever run `npx prisma migrate deploy`
# against this container (we won't from CMD — CI runs migrations against
# the DB before swapping the container — but keeping it makes ad-hoc
# debugging trivial).
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs
EXPOSE 3000

# server.js is the standalone entrypoint Next.js emits at the root.
CMD ["node", "server.js"]
