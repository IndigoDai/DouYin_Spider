import fs from 'fs';
import path from 'path';
import vm from 'vm';
import crypto from 'crypto';
import { createRequire } from 'module';
import { findStaticDir } from './util';

type AbFn = (query: string, data: string) => string;
type ReqSignFn = (signData: string, privateKey: string) => string;
type ReeKeyFn = (privateKey: string) => string;

const MS_TOKEN_CHARS = 'ABCDEFGHIGKLMNOPQRSTUVWXYZabcdefghigklmnopqrstuvwxyz0123456789=';

/**
 * Bridges to the reverse-engineered DouYin signing JS (static/dy_ab.js).
 *
 * dy_ab.js is self-contained: it builds its own `window` mock and only needs
 * `require('jsrsasign')`. We load it into a vm context and pull out the three
 * top-level functions get_ab / get_req_sign / get_ree_key. These cannot be
 * re-implemented in pure TS — they ARE the obfuscated risk-control logic.
 */
export class Signer {
  private getAb: AbFn;
  private getReqSign: ReqSignFn;
  private getReeKey: ReeKeyFn;

  constructor(abJsPath?: string) {
    const jsPath = abJsPath ?? path.join(findStaticDir(), 'dy_ab.js');
    const code = fs.readFileSync(jsPath, 'utf-8');

    // jsrsasign may live either next to dy_ab.js (original repo root node_modules)
    // or in this ts project's node_modules. Try both.
    const repoRequire = createRequire(jsPath);
    const localRequire = createRequire(__filename);
    const requireShim = (id: string): unknown => {
      try {
        return repoRequire(id);
      } catch {
        return localRequire(id);
      }
    };

    const sandbox: Record<string, unknown> = {
      require: requireShim,
      console,
      module: {},
      exports: {},
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      Date,
      Math,
      performance: require('perf_hooks').performance,
      TextEncoder,
      TextDecoder,
      Buffer,
      process,
    };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: jsPath });

    this.getAb = sandbox.get_ab as AbFn;
    this.getReqSign = sandbox.get_req_sign as ReqSignFn;
    this.getReeKey = sandbox.get_ree_key as ReeKeyFn;

    if (typeof this.getAb !== 'function' || typeof this.getReqSign !== 'function') {
      throw new Error('Failed to extract signing functions from dy_ab.js');
    }
  }

  /** a_bogus: DouyinAPI web request risk-control signature. */
  aBogus(query: string, data = ''): string {
    return this.getAb(query, data);
  }

  /** bd-ticket-guard request-level ECDSA signature over a sign-data string. */
  reqSign(signData: string, privateKey: string): string {
    return this.getReqSign(signData, privateKey);
  }

  /** Derive the ree public key from the EC private key. */
  reeKey(privateKey: string): string {
    return this.getReeKey(privateKey);
  }

  /** bd-ticket-guard-client-data header value (base64url of a JSON envelope). */
  bdTicketClientData(api: string, ticket: string, tsSign: string, privateKey: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signData = `ticket=${ticket}&path=${api}&timestamp=${timestamp}`;
    const payload = {
      ts_sign: tsSign,
      req_content: 'ticket,path,timestamp',
      req_sign: this.reqSign(signData, privateKey),
      timestamp,
    };
    return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  }

  static md5Hex(input: string): string {
    return crypto.createHash('md5').update(input, 'utf-8').digest('hex');
  }

  static msToken(length = 107): string {
    let s = '';
    for (let i = 0; i < length; i++) {
      s += MS_TOKEN_CHARS[Math.floor(Math.random() * MS_TOKEN_CHARS.length)];
    }
    return s;
  }

  static fakeWebId(length = 19): string {
    let s = '';
    for (let i = 0; i < length; i++) s += Math.floor(Math.random() * 10).toString();
    return s;
  }
}
