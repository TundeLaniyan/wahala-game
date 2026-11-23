# City Rumble online server: a container around the single-file bundle (docs/CITY_RUMBLE_ONLINE.md section 9).
# NOT BUILT OR RUN in the development container (no Docker there). What IS verified: `npm run bundle` output runs with
# plain `node` outside the repo and passed a full 8-client load test (server/bench/load.ts --server-bundle).
#
#   cd server && npm run bundle && docker build -t wahala-rumble-server .
#   docker run -p 2567:2567 -e RUMBLE_ALLOWED_ORIGINS=https://your-game-host wahala-rumble-server
#
# TLS (wss://) is terminated in front of it (a reverse proxy / load balancer); the process speaks plain ws on PORT.
FROM node:22-slim
ENV NODE_ENV=production PORT=2567
WORKDIR /app
COPY dist/rumble-server.mjs ./rumble-server.mjs
USER node
EXPOSE 2567
CMD ["node", "rumble-server.mjs"]
