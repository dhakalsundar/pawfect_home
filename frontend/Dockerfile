# Multi-stage build for the Next.js frontend. The runtime image carries the built .next output and
# production node_modules only — no source, no dev tooling.
FROM node:24-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm ci

COPY . .
# NEXT_PUBLIC_* values are inlined at build time. The defaults point at the local API, which is what
# docker-compose maps to the host; override with build args for a real deployment.
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./

# Never run as root.
USER node

EXPOSE 3000

CMD ["npm", "start"]
