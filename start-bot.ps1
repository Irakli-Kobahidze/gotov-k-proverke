# Запуск бота «Готов к проверке». Запускается двойным щелчком по start-bot.cmd.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$Host.UI.RawUI.WindowTitle = 'Готов к проверке — бот MAX'

function Fail($msg) {
  Write-Host ''
  Write-Host "[ОШИБКА] $msg" -ForegroundColor Red
  Read-Host 'Нажмите Enter, чтобы закрыть окно'
  exit 1
}

Write-Host '=============================================='
Write-Host '  Запуск бота «Готов к проверке» для MAX'
Write-Host '=============================================='

# 1. Node.js: установленный или портативный
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $portable = Join-Path $env:TEMP 'gkp-node\node-v24.21.0-win-x64'
  if (Test-Path (Join-Path $portable 'node.exe')) { $env:Path = "$portable;$env:Path" }
  else { Fail 'Не найден Node.js. Установите Node.js LTS с https://nodejs.org (кнопка «Download», дальше везде «Next») и запустите снова.' }
}
Write-Host "Node.js $(node --version) найден." -ForegroundColor Green

# 2. Токен
if (-not (Test-Path '.env')) { Fail 'Нет файла .env с токеном. Скопируйте .env.example в .env и впишите BOT_TOKEN.' }

# 3. Связь с MAX
Write-Host 'Проверяю связь с серверами MAX...'
curl.exe -s -o NUL -m 15 https://platform-api.max.ru/
if ($LASTEXITCODE -ne 0) { Fail 'Нет связи с platform-api.max.ru. Скорее всего включён VPN или компьютер не в российской сети. Выключите VPN и запустите снова.' }
Write-Host 'Связь с MAX есть.' -ForegroundColor Green

# 3b. Сертификаты. Node.js не использует хранилище сертификатов Windows, поэтому собираем для него
# файл: сертификаты Минцифры (certs/russian-trusted-ca.pem) + цепочка, которую Windows строит для MAX.
$bundle = Join-Path $PSScriptRoot 'certs\local-ca-bundle.pem'
$pemParts = @((Get-Content (Join-Path $PSScriptRoot 'certs\russian-trusted-ca.pem') -Raw))
try {
  $tcp = New-Object Net.Sockets.TcpClient('platform-api.max.ru', 443)
  $ssl = New-Object Net.Security.SslStream($tcp.GetStream(), $false, { $true })
  $ssl.AuthenticateAsClient('platform-api.max.ru')
  $leaf = New-Object Security.Cryptography.X509Certificates.X509Certificate2($ssl.RemoteCertificate)
  $chain = New-Object Security.Cryptography.X509Certificates.X509Chain
  [void]$chain.Build($leaf)
  foreach ($el in $chain.ChainElements) {
    $c = $el.Certificate
    if ($c.Thumbprint -eq $leaf.Thumbprint) { continue }
    $b64 = [Convert]::ToBase64String($c.RawData) -replace '(.{64})', "`$1`n"
    $pemParts += "-----BEGIN CERTIFICATE-----`n$($b64.TrimEnd())`n-----END CERTIFICATE-----`n"
    Write-Host "  сертификат: $($c.Subject)"
  }
  $ssl.Dispose(); $tcp.Dispose()
} catch {
  Write-Host "  (не удалось получить цепочку из Windows: $($_.Exception.Message)) — использую только сертификаты Минцифры"
}
[IO.File]::WriteAllText($bundle, ($pemParts -join "`n"))
$env:NODE_EXTRA_CA_CERTS = $bundle
Write-Host 'Сертификаты для Node.js подготовлены.' -ForegroundColor Green

# 4. Зависимости и сборка (при первом запуске)
if (-not (Test-Path 'web\dist\index.html')) {
  Write-Host 'Первый запуск: устанавливаю зависимости и собираю мини-приложение (1–2 минуты)...'
  Push-Location web
  cmd /c 'npm ci --no-audit --no-fund'; if ($LASTEXITCODE -ne 0) { Fail 'Не удалось установить зависимости мини-приложения. Проверьте интернет.' }
  cmd /c 'npm run build'; if ($LASTEXITCODE -ne 0) { Fail 'Не удалось собрать мини-приложение.' }
  Pop-Location
}
if (-not (Test-Path 'server\node_modules')) {
  Push-Location server
  cmd /c 'npm ci --omit=dev --no-audit --no-fund'; if ($LASTEXITCODE -ne 0) { Fail 'Не удалось установить зависимости сервера. Проверьте интернет.' }
  Pop-Location
}

# 5. Запуск
Write-Host ''
Write-Host 'Бот запускается. НЕ закрывайте это окно, пока бот нужен.' -ForegroundColor Yellow
Write-Host 'Остановить: Ctrl+C или закрыть окно.'
Write-Host ''
Set-Location server
node --use-system-ca --disable-warning=ExperimentalWarning --env-file=../.env src/index.js
Read-Host 'Бот остановлен. Нажмите Enter, чтобы закрыть окно'