import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

const DEFAULT_VERSION = '2';

export class NgrokCloudApi {
  constructor({ apiKey, baseUrl = 'https://api.ngrok.com', version = DEFAULT_VERSION } = {}) {
    this._apiKey = apiKey;
    this._baseUrl = baseUrl;
    this._version = version;
    this._session = new Soup.Session();
  }

  destroy() {
    this._session?.abort();
    this._session = null;
  }

  async getAccount() {
    const msg = Soup.Message.new('GET', `${this._baseUrl}/account`);
    msg.request_headers.append('Authorization', `Bearer ${this._apiKey}`);
    // ngrok docs use "ngrok-version" but header names are case-insensitive.
    msg.request_headers.append('ngrok-version', this._version);

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
    const text = new TextDecoder().decode(bytes.get_data());

    if (status < 200 || status >= 300) {
      // Try to surface ngrok error payload if present.
      try {
        const err = JSON.parse(text);
        throw new Error(err?.msg || err?.message || `ngrok cloud api returned HTTP ${status}`);
      } catch {
        throw new Error(`ngrok cloud api returned HTTP ${status}`);
      }
    }

    return JSON.parse(text);
  }
}

