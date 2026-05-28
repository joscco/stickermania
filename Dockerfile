FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build -w @birthday/shared \
 && npm run build -w @birthday/frontend \
 && npm run build -w @birthday/backend

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY game.config.json ./game.config.json
# game.config.json (private, gitignored) is NOT in the image.
# adminPassword is injected at runtime via the ADMIN_PASSWORD env var.

EXPOSE 8080
CMD ["node", "backend/dist/backend/src/index.js"]
