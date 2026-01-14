#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UUID_DIR="${ROOT_DIR}/ngrok-indicator@reemostat.github.io"

cd "${ROOT_DIR}"

gnome-extensions pack "${UUID_DIR}" \
  --force \
  --extra-source=src \
  --extra-source=icons \
  --schema=schemas/org.gnome.shell.extensions.ngrok-indicator.gschema.xml

gnome-extensions install --force "./ngrok-indicator@reemostat.github.io.shell-extension.zip"

echo
echo "Installed. To pick up a *new* extension UUID, restart GNOME Shell."
echo "Then enable with: gnome-extensions enable ngrok-indicator@reemostat.github.io"

