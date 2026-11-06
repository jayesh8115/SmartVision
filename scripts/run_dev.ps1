# Run the backend locally on Windows PowerShell: .\scripts\run_dev.ps1
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir    = Join-Path $ScriptDir ".."
$BackendDir = Join-Path $RootDir "backend"

# Resolve the venv - check backend\.venv first, then root .venv
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    $VenvPython = Join-Path $RootDir ".venv\Scripts\python.exe"
}
if (-not (Test-Path $VenvPython)) {
    $VenvPython = "python"   # fall back to system python
}

# Kill anything already holding port 8000 so we never get error 10048
$OldPid = (netstat -ano | Select-String ":8000\s+.*LISTENING" |
           ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -First 1)
if ($OldPid) {
    Write-Host "Killing existing process on port 8000 (PID $OldPid)..."
    Stop-Process -Id $OldPid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
}

# Ensure .env exists (config.py uses an absolute path, so CWD doesn't matter)
$EnvFile = Join-Path $BackendDir ".env"
if (-not (Test-Path $EnvFile)) {
    Copy-Item (Join-Path $BackendDir ".env.example") $EnvFile
    Write-Host "Created backend\.env from .env.example - edit it before going to production."
}

Write-Host "Starting SmartVision FastAPI on http://127.0.0.1:8000 ..."
Write-Host "  Swagger docs: http://127.0.0.1:8000/docs"
Write-Host "  Python:       $VenvPython"

# Launch uvicorn - no need to cd; config.py resolves .env absolutely
& $VenvPython -m uvicorn app.main:app --app-dir $BackendDir --host 127.0.0.1 --port 8000 --reload

