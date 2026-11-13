param(
    [Parameter(Mandatory=$false)]
    [string]$Password = ""
)

$mysqlExe = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
if (-not (Test-Path $mysqlExe)) {
    $found = Get-Command mysql.exe -ErrorAction SilentlyContinue
    if ($found) {
        $mysqlExe = $found.Source
    } else {
        Write-Error "mysql.exe was not found. Please ensure MySQL Server 8.0 is installed."
        exit 1
    }
}

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $projectRoot) {
    $projectRoot = Get-Location
}

$sqlFiles = @(
    "database/schema.sql",
    "database/sample_data.sql",
    "database/views.sql",
    "database/procedures.sql",
    "database/triggers.sql",
    "database/indexes.sql"
)

Write-Host "==> Starting database import into MySQL Server 8.0..." -ForegroundColor Cyan

foreach ($relFile in $sqlFiles) {
    $fullPath = Join-Path $projectRoot $relFile
    $normalizedPath = $fullPath -replace '\\', '/'
    Write-Host "  -> Running $relFile..." -ForegroundColor Yellow
    
    if ([string]::IsNullOrEmpty($Password)) {
        & $mysqlExe -u root --default-character-set=utf8mb4 -e "source $normalizedPath"
    } else {
        & $mysqlExe -u root "-p$Password" --default-character-set=utf8mb4 -e "source $normalizedPath"
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Execution of $relFile failed with exit code $LASTEXITCODE."
        exit $LASTEXITCODE
    }
}

Write-Host "==> Database imported successfully!" -ForegroundColor Green

# Generate .env files
$sessionSecret = [System.Guid]::NewGuid().ToString("N")
$envContent = @"
PORT=3000
NODE_ENV=development
SESSION_SECRET=$sessionSecret

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=$Password
DB_NAME=university_management_db
DB_CONNECTION_LIMIT=10
"@

Set-Content -Path (Join-Path $projectRoot ".env") -Value $envContent -Encoding utf8
Set-Content -Path (Join-Path $projectRoot "backend\.env") -Value $envContent -Encoding utf8

Write-Host "==> .env configuration created successfully." -ForegroundColor Green

