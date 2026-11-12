FROM node:24.22.1-bookworm-slim AS build
WORKDIR /app

RUN npm install --global npm@11.19.1
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/api/package.json packages/api/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/src apps/api/src
COPY apps/web apps/web
COPY packages/api/tsconfig.json packages/api/tsconfig.json
COPY packages/api/generated packages/api/generated
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24.22.1-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/packages/api/package.json ./packages/api/package.json
COPY --from=build /app/packages/api/dist ./packages/api/dist
COPY --from=build /app/packages/api/generated/openapi.json ./packages/api/generated/openapi.json

USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
