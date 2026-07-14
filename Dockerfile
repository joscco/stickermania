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
ARG FRONTEND_BUILD_SCRIPT=build
RUN npm run _build:shared && npm run ${FRONTEND_BUILD_SCRIPT} -w @stickermania/frontend && npm run build -w @stickermania/backend

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
# Runtime config is compiled into the backend. Secrets are injected via env vars.

EXPOSE 8080
CMD ["node", "apps/backend/dist/index.js"]
