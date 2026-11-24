# Hardened wrapper around the SAME single-file bundle that server/Dockerfile runs (build the bundle first):
#   (cd server && npm run bundle)
#   docker build -f ops/docker/Dockerfile -t wahala-rumble-server:ops server
# Differences from server/Dockerfile: a HEALTHCHECK, OCI labels, a pinnable base image, and a documented init/limits
# profile in compose.yml. Nothing about the server's behaviour changes.
# Pin the base by digest for releases: --build-arg NODE_IMAGE=node:22-slim@sha256:<digest> (the digest validated on
# 2026-11-24 is recorded in docs/ops/03-DOCKER.md).
ARG NODE_IMAGE=node:22-slim
FROM ${NODE_IMAGE}
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="wahala-rumble-server" \
      org.opencontainers.image.description="WAHALA! City Rumble authoritative game server (single-file bundle)" \
      org.opencontainers.image.revision="${GIT_SHA}"
ENV NODE_ENV=production PORT=2567
WORKDIR /app
COPY dist/rumble-server.mjs ./rumble-server.mjs
USER node
EXPOSE 2567
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||2567)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "rumble-server.mjs"]
