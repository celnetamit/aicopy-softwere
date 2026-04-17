#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_ID="manuscript-editor"
APP_NAME="Manuscript Editor"
VERSION="${1:-1.0.0}"
ARCH="${2:-$(dpkg --print-architecture)}"

BUILD_ROOT="${ROOT_DIR}/build/deb"
PKG_DIR="${BUILD_ROOT}/${APP_ID}_${VERSION}_${ARCH}"
DIST_DIR="${ROOT_DIR}/dist_deb"
OUT_DEB="${DIST_DIR}/${APP_ID}_${VERSION}_${ARCH}.deb"

echo "[1/7] Preparing folders..."
rm -rf "${PKG_DIR}"
mkdir -p \
  "${PKG_DIR}/DEBIAN" \
  "${PKG_DIR}/opt/${APP_ID}" \
  "${PKG_DIR}/usr/bin" \
  "${PKG_DIR}/usr/share/applications"
mkdir -p "${DIST_DIR}"

echo "[2/7] Copying application files..."
install -m 0644 "${ROOT_DIR}/main.py" "${PKG_DIR}/opt/${APP_ID}/main.py"
install -m 0644 "${ROOT_DIR}/chicago_editor.py" "${PKG_DIR}/opt/${APP_ID}/chicago_editor.py"
install -m 0644 "${ROOT_DIR}/document_processor.py" "${PKG_DIR}/opt/${APP_ID}/document_processor.py"
install -m 0644 "${ROOT_DIR}/requirements.txt" "${PKG_DIR}/opt/${APP_ID}/requirements.txt"
install -m 0644 "${ROOT_DIR}/README.md" "${PKG_DIR}/opt/${APP_ID}/README.md"
cp -a "${ROOT_DIR}/web" "${PKG_DIR}/opt/${APP_ID}/web"

echo "[3/7] Creating runtime virtual environment..."
python3 -m venv "${PKG_DIR}/opt/${APP_ID}/.venv"
"${PKG_DIR}/opt/${APP_ID}/.venv/bin/python" -m pip install --upgrade pip
"${PKG_DIR}/opt/${APP_ID}/.venv/bin/pip" install -r "${PKG_DIR}/opt/${APP_ID}/requirements.txt"

echo "[4/7] Installing launcher and desktop entry..."
install -m 0755 "${ROOT_DIR}/packaging/linux/manuscript-editor" "${PKG_DIR}/usr/bin/manuscript-editor"
install -m 0644 "${ROOT_DIR}/packaging/linux/manuscript-editor.desktop" "${PKG_DIR}/usr/share/applications/manuscript-editor.desktop"

echo "[5/7] Writing Debian control file..."
INSTALLED_SIZE="$(du -sk "${PKG_DIR}/opt/${APP_ID}" | awk '{print $1}')"
cat > "${PKG_DIR}/DEBIAN/control" <<EOF
Package: ${APP_ID}
Version: ${VERSION}
Section: editors
Priority: optional
Architecture: ${ARCH}
Depends: python3 (>= 3.10), python3-tk
Maintainer: Manuscript Editor Team <support@example.com>
Installed-Size: ${INSTALLED_SIZE}
Description: AI-powered manuscript copy editor with DOCX support
 Week 8 package build including local UI, AI settings, and export workflow.
EOF

echo "[6/7] Building .deb package..."
rm -f "${OUT_DEB}"
dpkg-deb --build --root-owner-group "${PKG_DIR}" "${OUT_DEB}"

echo "[7/7] Done."
echo "Output: ${OUT_DEB}"
