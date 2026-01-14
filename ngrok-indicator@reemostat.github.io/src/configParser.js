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

// Parse ngrok config v3 endpoints:
// endpoints:
//   - name: foo
//     url: https://foo.ngrok.app
//     upstream:
//       url: 8080
//
// Returns: [{ name, addr, proto }]
export function parseNgrokYamlEndpoints(yamlText) {
  const text = `${yamlText ?? ''}\n`;
  const lines = text.split('\n');

  let inEndpoints = false;
  let endpointsIndent = null;

  let current = null;
  let inUpstream = false;
  let upstreamIndent = null;
  const out = [];

  const flush = () => {
    if (!current)
      return;
    if (current.name) {
      out.push({
        name: current.name,
        proto: current.proto || '',
        addr: current.addr || '',
        url: current.url || '',
      });
    }
    current = null;
    inUpstream = false;
    upstreamIndent = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '    ');
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#'))
      continue;

    const indent = line.match(/^ */)?.[0]?.length ?? 0;

    if (!inEndpoints) {
      if (/^endpoints\s*:\s*$/.test(trimmed)) {
        inEndpoints = true;
        endpointsIndent = indent;
      }
      continue;
    }

    // leaving endpoints block
    if (indent <= endpointsIndent) {
      flush();
      inEndpoints = false;
      endpointsIndent = null;
      continue;
    }

    // New list item: "- ..." (start of an endpoint object)
    const itemMatch = trimmed.match(/^- (.*)$/);
    if (itemMatch) {
      flush();
      current = { name: '', addr: '', proto: '', url: '' };
      inUpstream = false;
      upstreamIndent = null;

      // Support "- name: foo" same-line syntax
      const rest = itemMatch[1].trim();
      const kv = rest.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)\s*$/);
      if (kv) {
        const key = kv[1];
        const value = _stripQuotes(kv[2]);
        if (key === 'name')
          current.name = value;
        else if (key === 'url')
          current.url = value;
      }
      continue;
    }

    if (!current)
      continue;

    // Track upstream nested object
    if (/^upstream\s*:\s*$/.test(trimmed)) {
      inUpstream = true;
      upstreamIndent = indent;
      continue;
    }

    if (inUpstream && upstreamIndent !== null && indent <= upstreamIndent) {
      inUpstream = false;
      upstreamIndent = null;
    }

    const kvMatch = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)\s*$/);
    if (!kvMatch)
      continue;

    const key = kvMatch[1];
    const value = _stripQuotes(kvMatch[2]);

    if (!inUpstream) {
      if (key === 'name')
        current.name = value;
      else if (key === 'url')
        current.url = value;
    } else {
      if (key === 'url')
        current.addr = value;
      else if (key === 'protocol')
        current.proto = value;
    }
  }

  flush();
  return out.filter(e => e.name);
}

export function readSavedTunnels(configPath) {
  const fallback = defaultNgrokConfigPath();
  const requested = configPath?.trim() || '';
  const path = requested || fallback;
  const tryRead = (p) => {
    try {
      const [ok, bytes] = GLib.file_get_contents(p);
      if (!ok)
        return null;
      return new TextDecoder().decode(bytes);
    } catch {
      return null;
    }
  };

  const yamlText = tryRead(path) ?? (path !== fallback ? tryRead(fallback) : null);
  if (yamlText === null)
    return [];

  try {
    const tunnels = parseNgrokYamlTunnels(yamlText);
    const endpoints = parseNgrokYamlEndpoints(yamlText);

    // Normalize endpoints to the same shape as tunnels
    const endpointsAsTunnels = endpoints.map(e => ({
      name: e.name,
      proto: e.proto || '',
      addr: e.addr || e.url || '',
    }));

    // Merge, preferring unique names (endpoints can have spaces)
    const seen = new Set();
    const merged = [];
    for (const t of [...tunnels, ...endpointsAsTunnels]) {
      const k = `${t.name}`;
      if (seen.has(k))
        continue;
      seen.add(k);
      merged.push(t);
    }

    return merged;
  } catch {
    return [];
  }
}

