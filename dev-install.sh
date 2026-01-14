#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UUID_DIR="${ROOT_DIR}/ngrok-indicator@reemostat.github.io"
UUID="ngrok-indicator@reemostat.github.io"
ZIP="${ROOT_DIR}/${UUID}.shell-extension.zip"
INSTALL_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

cd "${ROOT_DIR}"

gnome-extensions pack "${UUID_DIR}" \
  --force \
  --extra-source=src \
  --extra-source=icons \
  --schema=schemas/org.gnome.shell.extensions.ngrok-indicator.gschema.xml

gnome-extensions install --force "${ZIP}"

# Compile schemas in the installed extension directory (safe even if already compiled).
if command -v glib-compile-schemas >/dev/null 2>&1; then
  glib-compile-schemas "${INSTALL_DIR}/schemas" || true
fi

# Try to enable (may still require GNOME Shell restart for first-time UUID discovery).
gnome-extensions enable "${UUID}" 2>/dev/null || true

# As a fallback, add UUID to enabled-extensions so it comes up after restart.
if command -v gsettings >/dev/null 2>&1; then
  current="$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null || echo '[]')"
  if [[ "${current}" != *"${UUID}"* ]]; then
    # Append UUID to the enabled-extensions array (best-effort).
    python3 - <<'PY' || true
import ast, os, subprocess, sys
uuid = os.environ.get("UUID", "ngrok-indicator@reemostat.github.io")
try:
    out = subprocess.check_output(["gsettings", "get", "org.gnome.shell", "enabled-extensions"], text=True).strip()
    arr = ast.literal_eval(out)
    if not isinstance(arr, list):
        arr = []
except Exception:
    arr = []
if uuid not in arr:
    arr.append(uuid)
subprocess.call(["gsettings", "set", "org.gnome.shell", "enabled-extensions", str(arr)])
PY
  fi
fi

echo
echo "Installed for testing."
echo
echo "Restart GNOME Shell to start testing:"
echo "- Wayland: log out/in"
echo "- X11: Alt+F2 -> r -> Enter"
echo
echo "If it still isn't enabled after restart:"
echo "  gnome-extensions enable ${UUID}"

