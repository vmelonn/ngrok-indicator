import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

function _argvToString(argv) {
  return argv.map(a => GLib.shell_quote(a)).join(' ');
}

async function _run(argv) {
  const proc = Gio.Subprocess.new(
    argv,
    Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
  );

  const [ok, stdout, stderr] = await new Promise((resolve, reject) => {
    proc.communicate_utf8_async(null, null, (_p, res) => {
      try {
        resolve(proc.communicate_utf8_finish(res));
      } catch (e) {
        reject(e);
      }
    });
  });

  const code = proc.get_exit_status();
  const out = (stdout || '').trim();
  const err = (stderr || '').trim();

  if (!ok || code !== 0) {
    const msg = err || out || `Command failed (exit ${code})`;
    throw new Error(`${msg}\n\nCommand: ${_argvToString(argv)}`);
  }

  return { stdout: out, stderr: err };
}

export class ProcessController {
  constructor({ ngrokPath = '/usr/local/bin/ngrok', configPath = '' } = {}) {
    this._ngrokPath = ngrokPath?.trim() || 'ngrok';
    this._configPath = configPath?.trim() || '';
  }

  setConfig({ ngrokPath, configPath } = {}) {
    if (typeof ngrokPath === 'string')
      this._ngrokPath = ngrokPath.trim() || 'ngrok';
    if (typeof configPath === 'string')
      this._configPath = configPath.trim();
  }

  async startTunnel(name) {
    const argv = [this._ngrokPath, 'start', name];
    if (this._configPath)
      argv.push('--config', this._configPath);
    return await _run(argv);
  }

  async startAll() {
    const argv = [this._ngrokPath, 'start', '--all'];
    if (this._configPath)
      argv.push('--config', this._configPath);
    return await _run(argv);
  }
}

