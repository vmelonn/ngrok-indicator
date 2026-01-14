import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

const DEFAULT_BASE_URL = 'http://127.0.0.1:4040';

export class NgrokApi {
  constructor({ baseUrl = DEFAULT_BASE_URL } = {}) {
    this._baseUrl = baseUrl;
    this._session = new Soup.Session();
  }

  setBaseUrl(baseUrl) {
    this._baseUrl = baseUrl?.trim() || DEFAULT_BASE_URL;
  }

  get baseUrl() {
    return this._baseUrl;
  }

  destroy() {
    // Abort any in-flight requests and free underlying resources.
    this._session?.abort();
    this._session = null;
  }

  async deleteTunnel(tunnelUri) {
    // ngrok v3 returns per-tunnel "uri" like "/api/tunnels/command_line".
    const url = `${this._baseUrl}${tunnelUri}`;
    const msg = Soup.Message.new('DELETE', url);

    const bytes = await new Promise((resolve, reject) => {
      this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (_sess, res) => {
        try {
          resolve(this._session.send_and_read_finish(res));
        } catch (e) {
          reject(e);
        }
      });
    });

    const status = msg.get_status();
    if (status < 200 || status >= 300) {
      const text = new TextDecoder().decode(bytes.get_data());
      // Try to bubble up ngrok error payload if present.
      try {
        const err = JSON.parse(text);
        throw new Error(err?.msg || err?.message || `ngrok api returned HTTP ${status}`);
      } catch {
        throw new Error(`ngrok api returned HTTP ${status}`);
      }
    }
  }

  async getTunnels() {
    const url = `${this._baseUrl}/api/tunnels`;
    const msg = Soup.Message.new('GET', url);

    const bytes = await new Promise((resolve, reject) => {
      this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (_sess, res) => {
        try {
          resolve(this._session.send_and_read_finish(res));
        } catch (e) {
          reject(e);
        }
      });
    });

    const status = msg.get_status();
    if (status < 200 || status >= 300) {
      throw new Error(`ngrok api returned HTTP ${status}`);
    }

    const text = new TextDecoder().decode(bytes.get_data());
    const json = JSON.parse(text);
    const tunnels = Array.isArray(json?.tunnels) ? json.tunnels : [];

    return tunnels.map(t => ({
      name: t?.name ?? '',
      id: t?.ID ?? t?.id ?? '',
      uri: t?.uri ?? '',
      publicUrl: t?.public_url ?? '',
      proto: t?.proto ?? '',
      addr: t?.config?.addr ?? ''
    })).filter(t => t.publicUrl);
  }
}

