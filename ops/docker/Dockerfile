# syntax=docker/dockerfile:1.7
# WAHALA! City Rumble server: reproducible container build (docs/ops/DEPLOYMENT.md).
#
# Build context = the REPOSITORY ROOT:
#   docker build -f ops/docker/Dockerfile -t wahala-rumble-server:local .
#
# It runs the server's own `npm run bundle` (no copied command, so it cannot drift) inside a throw-away build stage and
# ships only the single-file bundle on a slim Node image, as a non-root user, with a real health check.
# esbuild is pinned to the version in the root package-lock.json (checked below), the server's dependencies to
# server/package-lock.json (`npm ci`). Nothing from the game's client dependencies (three, react, playwright) is installed.
#
# TLS (wss://) is NOT done here: the process speaks plain ws on PORT; terminate TLS in front (ops/edge/nginx.conf).
ARG NODE_IMAGE=node:22-slim

# OPTIONAL extra CA certificates for the build stage only (a TLS-inspecting corporate or sandbox proxy). Empty by default.
# Pass a directory holding `ca-bundle.crt`:  docker build --build-context extra-ca=/path/to/dir ...
# It is only bind-mounted during the two npm steps; nothing of it lands in any image layer.
FROM scratch AS extra-ca

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
ARG ESBUILD_VERSION=0.28.2
ENV npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false
COPY server/package.json server/package-lock.json server/
RUN --mount=type=bind,from=extra-ca,target=/extra-ca \
    if [ -f /extra-ca/ca-bundle.crt ]; then export NODE_EXTRA_CA_CERTS=/extra-ca/ca-bundle.crt; fi; \
    cd server && npm ci
# the server's `bundle` script calls ../node_modules/.bin/esbuild: provide exactly that, at the pinned version
RUN --mount=type=bind,from=extra-ca,target=/extra-ca \
    if [ -f /extra-ca/ca-bundle.crt ]; then export NODE_EXTRA_CA_CERTS=/extra-ca/ca-bundle.crt; fi; \
    npm install --prefix /repo --no-save --no-package-lock --ignore-scripts esbuild@${ESBUILD_VERSION} \
 && test "$(/repo/node_modules/.bin/esbuild --version)" = "${ESBUILD_VERSION}"
COPY tsconfig.json ./
COPY src ./src
COPY server ./server
RUN cd server && npm run bundle && test -s dist/rumble-server.mjs

FROM ${NODE_IMAGE} AS runtime
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="wahala-rumble-server" \
      org.opencontainers.image.description="WAHALA! City Rumble authoritative multiplayer server (Colyseus)" \
      org.opencontainers.image.revision="${GIT_SHA}"
ENV NODE_ENV=production PORT=2567
WORKDIR /app
COPY --from=build /repo/server/dist/rumble-server.mjs ./rumble-server.mjs
USER node
EXPOSE 2567
# /health is {"ok":true} while the HTTP server answers. It does not prove the tick loop is healthy: that is the
# event-loop / dropped-tick alerting in docs/ops/MONITORING.md.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||2567)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# run with `docker run --init` (compose: init: true) so signals and zombie reaping are handled by tini
CMD ["node", "rumble-server.mjs"]
