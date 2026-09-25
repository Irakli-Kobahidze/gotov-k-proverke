#!/usr/bin/env bash
# Установка «Готов к проверке» на чистый сервер Ubuntu 22.04/24.04.
# Запуск из папки проекта: bash setup-server.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "== 1/4 Docker =="
if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y docker.io docker-compose-v2
fi
# Зеркало Docker Hub: из России основной реестр бывает недоступен.
if [ ! -f /etc/docker/daemon.json ]; then
  echo '{"registry-mirrors":["https://mirror.gcr.io"]}' > /etc/docker/daemon.json
  systemctl restart docker
fi

echo "== 2/4 Адрес сервера =="
IP=$(ip -4 route get 1.1.1.1 | awk '{for (i=1;i<=NF;i++) if ($i=="src") print $(i+1)}')
DOMAIN="${IP//./-}.sslip.io"
echo "IP: $IP, адрес мини-приложения: https://$DOMAIN"

echo "== 3/4 Настройки (.env) =="
if [ ! -f .env ]; then
  read -r -p "Введите токен бота (BOT_TOKEN) и нажмите Enter: " TOKEN
  TOKEN=$(echo "$TOKEN" | tr -d '[:space:]')
  if [ -z "$TOKEN" ]; then echo "Токен пустой — запустите скрипт снова."; exit 1; fi
  cat > .env <<EOF
BOT_TOKEN=$TOKEN
MINIAPP_URL=https://$DOMAIN
DOMAIN=$DOMAIN
BOT_ENABLED=true
HOST_PORT=8080
REMINDER_DEMO_SECONDS=60
DEV_AUTH=false
EOF
  chmod 600 .env
else
  echo ".env уже есть — оставляю как есть."
fi

echo "== 4/4 Сборка и запуск (2–4 минуты) =="
docker compose --profile https up -d --build
sleep 8
docker compose ps
docker compose logs app --tail 15
echo
echo "Готово. Мини-приложение: https://$DOMAIN"
echo "Логи: docker compose logs -f app   Перезапуск: docker compose --profile https up -d"
