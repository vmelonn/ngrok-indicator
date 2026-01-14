# Ngrok Indicator (GNOME Shell Extension)

Top-bar indicator for **ngrok**: see status, copy tunnel URLs, and start/stop tunnels.

## Features

- **Top bar icon**: ngrok logo with a small badge
  - Green: at least one tunnel active
  - Red: no tunnels (or local API unreachable)
- **Active tunnels**
  - Click a tunnel to copy its public URL to the clipboard
  - Stop a tunnel from the menu
- **Saved tunnels**
  - Reads `tunnels:` from `ngrok.yml`
  - Start a saved tunnel or start all
- **Preferences**
  - Local API base URL (default: `http://127.0.0.1:4040`)
  - ngrok binary path + ngrok.yml path
  - Optional ngrok cloud account verification (API key)
  - Max concurrent tunnels limit (used to disable “Start…” actions)

## Privacy / permissions

- **Clipboard**: URLs are copied **only when you click** a tunnel item.
- **Network**:
  - Polls your local ngrok agent API (`api-base-url`, default `127.0.0.1:4040`) to list tunnels
  - Optionally queries `https://api.ngrok.com/account` **only from Preferences** when you click Verify and provide an API key

## Install (local / dev)

From this repo root:

```bash
cd "ngrok-indicator"

gnome-extensions pack ./ngrok-indicator@reemostat.github.io \
  --force \
  --extra-source=src \
  --extra-source=icons \
  --schema=schemas/org.gnome.shell.extensions.ngrok-indicator.gschema.xml

gnome-extensions install --force ./ngrok-indicator@reemostat.github.io.shell-extension.zip
gnome-extensions enable ngrok-indicator@reemostat.github.io
```

If the new UUID doesn’t show up, restart GNOME Shell:

- **X11**: `Alt+F2` → `r` → Enter
- **Wayland**: log out and back in

## Publish to extensions.gnome.org (notes)

- Create the submission zip using the `gnome-extensions pack` command above.
- Upload the generated `ngrok-indicator@reemostat.github.io.shell-extension.zip` in the extensions.gnome.org developer portal.

## Requirements

- GNOME Shell **46**
- ngrok agent (tested with `ngrok version 3.x` and local API at `127.0.0.1:4040`)

