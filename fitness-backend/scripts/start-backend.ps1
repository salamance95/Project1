$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

$venvPython = Join-Path (Get-Location) ".venv\Scripts\python.exe"
if (Test-Path $venvPython) {
  $pythonPath = $venvPython
} else {
  $pythonBin = Get-Command python -ErrorAction SilentlyContinue
  if (-not $pythonBin) {
    $pythonBin = Get-Command py -ErrorAction SilentlyContinue
  }

  if (-not $pythonBin) {
    Write-Error "Python command not found. Install Python 3 and make sure python or py is available in PATH."
  }

  $pythonPath = $pythonBin.Source
}

& $pythonPath -c "import fastapi, uvicorn, sqlalchemy"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Installing backend dependencies from requirements.txt..."
  & $pythonPath -m pip install -r requirements.txt
}

Write-Host "Starting backend at http://127.0.0.1:8001"
& $pythonPath -m uvicorn app.main:app --host 127.0.0.1 --port 8001
