import { Signer } from './signer';
import { DouyinAuth } from './auth';
import { spliceUrl } from './util';

const PLATFORM_PARAMS: Record<string, string> = {
  device_platform: 'webapp',
  aid: '6383',
  channel: 'channel_pc_web',
  pc_client_type: '1',
  update_version_code: '170400',
  version_code: '170400',
  version_name: '17.4.0',
  cookie_enabled: 'true',
  screen_width: '1707',
  screen_height: '960',
  browser_language: 'zh-CN',
  browser_platform: 'Win32',
  browser_name: 'Edge',
  browser_version: '125.0.0.0',
  browser_online: 'true',
  engine_name: 'Blink',
  engine_version: '125.0.0.0',
  os_name: 'Windows',
  os_version: '10',
  cpu_core_num: '32',
  device_memory: '8',
  platform: 'PC',
  downlink: '10',
  effective_type: '4g',
  round_trip_time: '100',
};

/** Ordered query-param builder, mirrors builder/params.py. Insertion order matters. */
export class Params {
  private params: Record<string, string> = {};

  constructor(private signer?: Signer) {}

  withPlatform(): this {
    Object.assign(this.params, PLATFORM_PARAMS);
    return this;
  }

  add(key: string, value: string | number): this {
    this.params[key] = String(value);
    return this;
  }

  withWebId(webid: string): this {
    this.params['webid'] = webid;
    return this;
  }

  withMsToken(): this {
    this.params['msToken'] = Signer.msToken();
    return this;
  }

  /** Compute a_bogus over the CURRENT params (insertion order), then append it. */
  withABogus(data = ''): this {
    if (!this.signer) throw new Error('Params needs a Signer for withABogus');
    const query = spliceUrl(this.params);
    const aBogus = this.signer.aBogus(query, data);
    this.params['a_bogus'] = aBogus;
    return this;
  }

  get(): Record<string, string> {
    return this.params;
  }

  toString(): string {
    return Object.entries(this.params)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
  }

  /** Shortcut: add verifyFp + fp (= s_v_web_id) used by most web endpoints. */
  withFp(auth: DouyinAuth): this {
    this.params['verifyFp'] = auth.sVWebId;
    this.params['fp'] = auth.sVWebId;
    return this;
  }
}
