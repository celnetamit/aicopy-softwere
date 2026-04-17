@echo off
setlocal

cd /d "%~dp0\..\.."

if not exist ".venv-build\Scripts\python.exe" (
    echo [1/5] Creating build virtualenv...
    py -3 -m venv .venv-build
    if errorlevel 1 goto :error
)

echo [2/5] Installing build dependencies...
".venv-build\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto :error
".venv-build\Scripts\python.exe" -m pip install -r requirements-build.txt
if errorlevel 1 goto :error

echo [3/5] Cleaning old build output...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist

echo [4/5] Building Windows executable with PyInstaller...
".venv-build\Scripts\python.exe" -m PyInstaller --noconfirm --clean --windowed --name ManuscriptEditor --add-data "web;web" --collect-all eel --hidden-import pkg_resources --hidden-import bottle_websocket --hidden-import geventwebsocket --hidden-import tkinter --hidden-import tkinter.filedialog main.py
if errorlevel 1 goto :error

echo [5/5] Done.
echo Output: dist\ManuscriptEditor\ManuscriptEditor.exe
exit /b 0

:error
echo Build failed.
exit /b 1
