import { Signer } from './signer';

/**
 * Mirrors builder/auth.py DouyinAuth.
 *
 * cookieStr      : the full document.cookie from a logged-in douyin.com session.
 * webProtectStr  : raw JSON captured from the web_protect response
 *                  (contains ticket / ts_sign / client_cert). Required to SEND.
 * keysStr        : raw JSON containing ec_privateKey. Required to SEND.
 *
 * Receiving private messages only needs the cookie.
 */
export class DouyinAuth {
  cookie: Record<string, string> = {};
  cookieStr = '';

  ticket?: string;
  tsSign?: string;
  clientCert?: string;
  privateKey?: string;
  reePublicKey?: string;
  msToken!: string;

  private _uid?: number;

  prepare(cookieStr: string, webProtectStr = '', keysStr = ''): this {
    this.cookie = DouyinAuth.parseCookies(cookieStr);
    this.msToken = this.cookie['msToken'] ?? Signer.msToken();
    this.cookie['msToken'] = this.msToken;
    this.cookieStr = Object.entries(this.cookie)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    if (webProtectStr) {
      const wp = JSON.parse(JSON.parse(webProtectStr).data);
      this.ticket = wp.ticket;
      this.tsSign = wp.ts_sign;
      this.clientCert = wp.client_cert;
    }
    if (keysStr) {
      const keys = JSON.parse(JSON.parse(keysStr).data);
      this.privateKey = keys.ec_privateKey;
      this.reePublicKey = Buffer.from(this.privateKey ?? '', 'utf-8').toString('base64');
    }
    return this;
  }

  setUid(uid: number): void {
    this._uid = uid;
  }

  get uid(): number {
    if (this._uid === undefined) {
      throw new Error('uid not set. Call DouyinAPI.getMyUid(auth) first or auth.setUid(...).');
    }
    return this._uid;
  }

  get sVWebId(): string {
    const v = this.cookie['s_v_web_id'];
    if (!v) throw new Error('cookie is missing s_v_web_id');
    return v;
  }

  get sessionId(): string {
    const v = this.cookie['sessionid'];
    if (!v) throw new Error('cookie is missing sessionid');
    return v;
  }

  static parseCookies(cookieStr: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const part of cookieStr.split('; ')) {
      const idx = part.indexOf('=');
      if (idx <= 0) continue;
      out[part.slice(0, idx)] = part.slice(idx + 1);
    }
    return out;
  }
}
