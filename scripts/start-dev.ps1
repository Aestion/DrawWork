$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repo "config\.env"

if (!(Test-Path $envFile)) {
  throw "Missing config\.env. Copy config\.env.example first."
}

$envMap = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match "^([A-Z0-9_]+)=(.*)$") {
    $value = $matches[2] -replace "\s+#.*$", ""
    $envMap[$matches[1]] = $value
  }
}

$dbUser = if ($envMap.DB_USER) { $envMap.DB_USER } else { "postgres" }
$dbPass = $envMap.DB_PASSWORD
$dbName = if ($envMap.DB_NAME) { $envMap.DB_NAME } else { "drawwork" }
$dbPort = if ($envMap.DB_PORT) { $envMap.DB_PORT } else { "5432" }
$redisUrl = if ($envMap.REDIS_URL) { $envMap.REDIS_URL } else { "redis://localhost:6379" }
$jwtSecret = if ($envMap.JWT_SECRET) { $envMap.JWT_SECRET } else { "drawwork-local-test-secret-key" }

$commonEnv = @{
  DATABASE_URL = "postgres://${dbUser}:${dbPass}@localhost:${dbPort}/${dbName}"
  REDIS_URL = $redisUrl
  JWT_SECRET = $jwtSecret
  JWT_EXPIRES_IN = if ($envMap.JWT_EXPIRES_IN) { $envMap.JWT_EXPIRES_IN } else { "24h" }
  JWT_REFRESH_EXPIRES_IN = if ($envMap.JWT_REFRESH_EXPIRES_IN) { $envMap.JWT_REFRESH_EXPIRES_IN } else { "7d" }
  NODE_ENV = "development"
}

function Start-NodeService {
  param(
    [string]$Name,
    [string]$WorkingDirectory,
    [string]$Command,
    [hashtable]$ExtraEnv
  )

  $logPath = Join-Path $repo "logs\$Name.log"
  $envScript = ""
  foreach ($entry in ($commonEnv + $ExtraEnv).GetEnumerator()) {
    $escaped = $entry.Value -replace "'", "''"
    $envScript += "`$env:$($entry.Key)='$escaped'; "
  }

  $script = "$envScript Set-Location '$WorkingDirectory'; $Command *> '$logPath'"
  Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-Command", $script) -WindowStyle Hidden
  Write-Host "Started $Name, log: $logPath"
}

New-Item -ItemType Directory -Force -Path (Join-Path $repo "logs") | Out-Null

Start-NodeService `
  -Name "api" `
  -WorkingDirectory (Join-Path $repo "backend") `
  -Command "& node src\app.js" `
  -ExtraEnv @{
    PORT = "3000"
    MINIO_ENDPOINT = if ($envMap.MINIO_ENDPOINT) { $envMap.MINIO_ENDPOINT } else { "localhost" }
    MINIO_PORT = if ($envMap.MINIO_PORT) { $envMap.MINIO_PORT } else { "9000" }
    MINIO_ACCESS_KEY = if ($envMap.MINIO_ACCESS_KEY) { $envMap.MINIO_ACCESS_KEY } else { "minioadmin" }
    MINIO_SECRET_KEY = $envMap.MINIO_SECRET_KEY
    MINIO_BUCKET = if ($envMap.MINIO_BUCKET) { $envMap.MINIO_BUCKET } else { "drawings" }
  }

Start-NodeService `
  -Name "yjs" `
  -WorkingDirectory (Join-Path $repo "yjs-server") `
  -Command "& node src\server.js" `
  -ExtraEnv @{ PORT = "3001" }

Start-NodeService `
  -Name "frontend" `
  -WorkingDirectory (Join-Path $repo "frontend") `
  -Command "& npm.cmd run dev -- --host 0.0.0.0 --port 5173" `
  -ExtraEnv @{}
