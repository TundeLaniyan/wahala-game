# syntax=docker/dockerfile:1.7
# WAHALA! player platform: reproducible container build. Build context = the REPOSITORY ROOT (the service shares the match
# server's name rule from src/net/protocol.ts, the fighter list from src/sim/data/characters.ts and the cosmetic catalogue in src/cosmetics):
#   docker build -f player-platform/Dockerfile -t wahala-player-platform:local .
# The image holds one bundled file per entry (server, migrate, purge, config check) + the SQL migrations, runs as the unprivileged
# `node` user and contains no dev dependency, no PGlite and no source. TLS is terminated in front of it (docs/PLATFORM_OPERATIONS.md).
ARG NODE_IMAGE=node:22-slim

# OPTIONAL extra CA certificates for the build stage only (a TLS-inspecting corporate or sandbox proxy). Empty by default.
# Pass a directory holding `ca-bundle.crt`:  docker build --build-context extra-ca=/path/to/dir ...  Nothing of it lands in a layer.
FROM scratch AS extra-ca

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
ARG ESBUILD_VERSION=0.28.2
ENV npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false
COPY player-platform/package.json player-platform/package-lock.json player-platform/
RUN --mount=type=bind,from=extra-ca,target=/extra-ca \
    if [ -f /extra-ca/ca-bundle.crt ]; then export NODE_EXTRA_CA_CERTS=/extra-ca/ca-bundle.crt; fi; \
    cd player-platform && npm ci --ignore-scripts
RUN --mount=type=bind,from=extra-ca,target=/extra-ca \
    if [ -f /extra-ca/ca-bundle.crt ]; then export NODE_EXTRA_CA_CERTS=/extra-ca/ca-bundle.crt; fi; \
    npm install --prefix /repo --no-save --no-package-lock --ignore-scripts esbuild@${ESBUILD_VERSION} \
 && test "$(/repo/node_modules/.bin/esbuild --version)" = "${ESBUILD_VERSION}"
COPY src/net/protocol.ts src/net/protocol.ts
COPY src/sim/data/characters.ts src/sim/data/characters.ts
COPY src/cosmetics src/cosmetics
COPY player-platform player-platform
RUN cd player-platform && npm run bundle && test -s dist/main.mjs

FROM ${NODE_IMAGE} AS runtime
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="wahala-player-platform" \
      org.opencontainers.image.description="WAHALA! player platform API (identity, social, safety, commerce foundations)" \
      org.opencontainers.image.revision="${GIT_SHA}"
ENV NODE_ENV=production PLATFORM_ENV=production PORT=4567 PLATFORM_HOST=0.0.0.0 PLATFORM_MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=build /repo/player-platform/dist/ ./
COPY player-platform/migrations ./migrations
USER node
EXPOSE 4567
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4567)+'/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "main.mjs"]
