import GLib from 'gi://GLib';

export function defaultNgrokConfigPath() {
  return GLib.build_filenamev([GLib.get_home_dir(), '.config', 'ngrok', 'ngrok.yml']);
}

function _stripQuotes(s) {
  const t = (s ?? '').trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))
    return t.slice(1, -1);
  return t;
}

// V1/V2 design: regex/line-based parser for predictable ngrok.yml shapes.
//
// Supports:
// tunnels:
//   frontend:
//     proto: http
//     addr: 3000
//   db:
//     proto: tcp
//     addr: 5432
//
// Returns: [{ name, proto, addr }]
export function parseNgrokYamlTunnels(yamlText) {
  const text = `${yamlText ?? ''}\n`;
  const lines = text.split('\n');

  let inTunnels = false;
  let tunnelsIndent = null;

  let current = null;
  const out = [];

  const flush = () => {
    if (!current)
      return;
    if (current.name) {
      out.push({
        name: current.name,
        proto: current.proto || '',
        addr: current.addr || '',
      });
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '    ');
    const trimmed = line.trim();

    // Skip blank lines and comments
    if (!trimmed || trimmed.startsWith('#'))
      continue;

    const indent = line.match(/^ */)?.[0]?.length ?? 0;

    if (!inTunnels) {
      if (/^tunnels\s*:\s*$/.test(trimmed)) {
        inTunnels = true;
        tunnelsIndent = indent;
      }
      continue;
    }

    // Leaving tunnels block (dedent to tunnelsIndent or less)
    if (indent <= tunnelsIndent) {
      flush();
      inTunnels = false;
      tunnelsIndent = null;
      continue;
    }

    // Tunnel name line: "<name>:"
    // We require it's exactly one indent level below tunnels: (common style),
    // but remain tolerant: any key line ending with ":" at indent > tunnelsIndent.
    const nameMatch = trimmed.match(/^([A-Za-z0-9._-]+)\s*:\s*$/);
    if (nameMatch) {
      flush();
      current = { name: nameMatch[1], proto: '', addr: '' };
      continue;
    }

    if (!current)
      continue;

    // Key/value inside tunnel block
    const kvMatch = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)\s*$/);
    if (!kvMatch)
      continue;

    const key = kvMatch[1];
    const value = _stripQuotes(kvMatch[2]);

    if (key === 'proto')
      current.proto = value;
    else if (key === 'addr')
      current.addr = value;
  }

  flush();

  // Filter any accidental non-tunnel keys parsed under tunnels:
  return out.filter(t => t.name);
}

export function readSavedTunnels(configPath) {
  const path = configPath?.trim() || defaultNgrokConfigPath();
  try {
    const [ok, bytes] = GLib.file_get_contents(path);
    if (!ok)
      return [];
    const yamlText = new TextDecoder().decode(bytes);
    return parseNgrokYamlTunnels(yamlText);
  } catch {
    return [];
  }
}

