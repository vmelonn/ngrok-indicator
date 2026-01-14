import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export class ProcessController {
  constructor({ ngrokPath = '/usr/local/bin/ngrok', configPath = '' } = {}) {
    this._ngrokPath = ngrokPath?.trim() || 'ngrok';
    this._configPath = configPath?.trim() || '';
    this._runningProcs = new Map();
  }

  setConfig({ ngrokPath, configPath } = {}) {
    if (typeof ngrokPath === 'string')
      this._ngrokPath = ngrokPath.trim() || 'ngrok';
    if (typeof configPath === 'string')
      this._configPath = configPath.trim();
  }

  async startTunnel(name) {
    if (this._runningProcs.has(name))
      return;

    const argv = [this._ngrokPath, 'start', name];
    if (this._configPath)
      argv.push('--config', this._configPath);
    
    argv.push('--log=stdout');

    try {
      const proc = Gio.Subprocess.new(
        argv,
        Gio.SubprocessFlags.NONE
      );
      this._runningProcs.set(name, proc);

      // Watch for process exit to clean up the map
      proc.wait_check_async(null, (_p, res) => {
        try {
          proc.wait_check_finish(res);
        } catch (e) {
          // Process exited with error or was killed
          // We don't need to log this as it happens on stopTunnel too
        }
        // If this exact process instance is still in the map, remove it
        if (this._runningProcs.get(name) === proc) {
          this._runningProcs.delete(name);
        }
      });

    } catch (e) {
      throw new Error(`Failed to spawn ngrok: ${e.message}`);
    }
  }

  async startAll() {
    if (this._runningProcs.has('__ALL__'))
      return;

    const argv = [this._ngrokPath, 'start', '--all'];
    if (this._configPath)
      argv.push('--config', this._configPath);
    argv.push('--log=stdout');

    try {
      const proc = Gio.Subprocess.new(
        argv,
        Gio.SubprocessFlags.NONE
      );
      this._runningProcs.set('__ALL__', proc);

      proc.wait_check_async(null, (_p, res) => {
        try {
          proc.wait_check_finish(res);
        } catch (e) {}
        if (this._runningProcs.get('__ALL__') === proc) {
          this._runningProcs.delete('__ALL__');
        }
      });

    } catch (e) {
      throw new Error(`Failed to spawn ngrok: ${e.message}`);
    }
  }

  stopTunnel(name) {
    if (this._runningProcs.has(name)) {
      const proc = this._runningProcs.get(name);
      try {
        proc.force_exit();
      } catch (e) {
        console.error(`Error killing tunnel ${name}: ${e}`);
      }
      // The wait_check_async callback will handle removal from map,
      // but we can also remove it immediately to be safe for quick restarts.
      this._runningProcs.delete(name);
    }
  }
}
