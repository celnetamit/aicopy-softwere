param(
    [switch]$BuildInstaller
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

$venvPython = Join-Path $repoRoot ".venv-build\Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
    Write-Host "[1/6] Creating build virtualenv..."
    py -3 -m venv .venv-build
}

Write-Host "[2/6] Installing build dependencies..."
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r requirements-build.txt

Write-Host "[3/6] Cleaning old build output..."
Remove-Item -Recurse -Force build, dist -ErrorAction SilentlyContinue

Write-Host "[4/6] Building Windows executable with PyInstaller..."
& $venvPython -m PyInstaller --noconfirm --clean --windowed --name ManuscriptEditor --add-data "web;web" --collect-all eel --hidden-import pkg_resources --hidden-import bottle_websocket --hidden-import geventwebsocket --hidden-import tkinter --hidden-import tkinter.filedialog main.py

Write-Host "[5/6] Portable build ready."
Write-Host "Output: dist\ManuscriptEditor\ManuscriptEditor.exe"

if ($BuildInstaller) {
    if (-not (Get-Command iscc -ErrorAction SilentlyContinue)) {
        throw "Inno Setup Compiler (iscc) not found. Install Inno Setup from https://jrsoftware.org/isinfo.php"
    }

    Write-Host "[6/6] Building installer .exe..."
    Remove-Item -Recurse -Force dist_installer -ErrorAction SilentlyContinue
    & iscc packaging\windows\ManuscriptEditor.iss
    Write-Host "Installer output: dist_installer\"
} else {
    Write-Host "[6/6] Skipping installer step (use -BuildInstaller to create setup .exe)."
}
