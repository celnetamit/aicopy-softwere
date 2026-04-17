@echo off
setlocal

cd /d "%~dp0\..\.."

call scripts\windows\build_exe.bat
if errorlevel 1 goto :error

where iscc >nul 2>nul
if errorlevel 1 (
    echo Inno Setup Compiler (iscc) not found.
    echo Install Inno Setup from https://jrsoftware.org/isinfo.php
    exit /b 1
)

if exist dist_installer rmdir /s /q dist_installer

echo Building installer .exe...
iscc packaging\windows\ManuscriptEditor.iss
if errorlevel 1 goto :error

echo Done. Installer output: dist_installer\
exit /b 0

:error
echo Installer build failed.
exit /b 1
