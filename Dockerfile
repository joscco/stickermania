FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run _build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/frontend/dist ./apps/frontend/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist

# game.config.json is intentionally NOT copied into the image.
# Game settings are passed as environment variables at runtime:
#   ADMIN_PASSWORD  – board password (required for production)
#   PORT            – HTTP port (set automatically by Cloud Run)
#   DATA_ROOT       – path for sessions/assets (default: .data)

EXPOSE 8080
CMD ["node", "apps/backend/dist/index.js"]