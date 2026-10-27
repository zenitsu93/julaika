# Build : client Vite + serveur bundlé par esbuild.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/client/package.json apps/client/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Runtime : seulement le bundle serveur, le client buildé et `ws`.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3001 STATIC_DIR=/app/public
RUN npm init -y >/dev/null && npm install --omit=dev ws@8 && npm cache clean --force
COPY --from=build /app/apps/server/dist/index.js ./server.mjs
COPY --from=build /app/apps/client/dist ./public
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3001/health || exit 1
CMD ["node", "server.mjs"]
