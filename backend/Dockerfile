# Multi-stage: the runtime image carries no TypeScript, no dev dependencies and no source.
FROM node:24-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Install production dependencies only. `npm ci --omit=dev` after the build keeps mongodb-memory-server
# and tsx out of the image entirely — the in-memory database fallback must never ship.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Never run as root. Node's alpine image ships an unprivileged `node` user for exactly this.
USER node

EXPOSE 5000

# No npm wrapper: npm swallows SIGTERM, which would break the graceful shutdown in server.ts and
# leave Socket.io connections hanging until the platform force-kills the container.
CMD ["node", "dist/server.js"]
