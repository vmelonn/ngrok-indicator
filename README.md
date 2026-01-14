# Ngrok Indicator (GNOME Extension)

Panel indicator for ngrok status + active tunnels.

## Current state (V1 / Iteration 1)

- Polls `http://127.0.0.1:4040/api/tunnels` every few seconds
- Icon color:
  - Grey: ngrok API not reachable
  - Orange: reachable but no tunnels
  - Green: at least one tunnel active
- Menu lists active tunnels; clicking a tunnel copies its public URL
- Menu includes a shortcut to open the local web interface (`localhost:4040`)

## Install (local)

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

Then restart GNOME Shell if needed:

- X11: press `Alt+F2`, type `r`, press Enter
- Wayland: log out and back in

## Dev notes

- Tested against GNOME Shell 46 (libsoup3).
- Next iteration adds start/stop controls + parsing `~/.config/ngrok/ngrok.yml`.

