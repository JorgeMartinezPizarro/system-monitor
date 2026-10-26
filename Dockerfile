# UI image (Next.js standalone). The collector has its own image: collector/Dockerfile.
# Nothing from .env* reaches the build (.dockerignore): all settings come from the container environment.

FROM node:22-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Runtime: only the standalone server and the static assets, no sources, no dev dependencies, no npm needed.
FROM node:22-trixie-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 WATCH_DIR=/reports
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
