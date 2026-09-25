# 1. Сборка мини-приложения (React + MAX UI)
FROM node:24-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# 2. Production-зависимости сервера
FROM node:24-alpine AS deps
WORKDIR /server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# 3. Итоговый образ: бот + API + статика мини-приложения в одном процессе
FROM node:24-alpine
ENV NODE_ENV=production \
    DATA_DIR=/data \
    WEB_DIR=/app/web \
    PORT=8080 \
    TZ=Europe/Moscow \
    NODE_EXTRA_CA_CERTS=/app/certs/max-ca-bundle.pem
RUN apk add --no-cache su-exec && mkdir -p /data && chown node:node /data
WORKDIR /app/server
COPY certs/max-ca-bundle.pem /app/certs/
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY server/ ./
COPY --from=deps /server/node_modules ./node_modules
COPY --from=web /web/dist /app/web
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
# Entrypoint выставляет права на /data (постоянное хранилище монтируется от root) и запускает процесс от пользователя node.
ENTRYPOINT ["sh", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
