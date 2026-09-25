#!/bin/sh
# Готовит каталог данных и запускает приложение от непривилегированного пользователя node.
# Постоянное хранилище (docker volume, Amvera /data) монтируется от root, поэтому права выставляем при старте.
set -e
DATA="${DATA_DIR:-/data}"
mkdir -p "$DATA"
chown -R node:node "$DATA" 2>/dev/null || true

if su-exec node test -w "$DATA"; then
  exec su-exec node "$@"
fi
echo "[entrypoint] $DATA недоступен для записи пользователю node — запускаю от root" >&2
exec "$@"
