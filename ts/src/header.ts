import { DouyinAuth } from './auth';
import { Signer } from './signer';

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/117.0';

export type HeaderType = 'GET' | 'POST' | 'FORM' | 'PROTOBUF' | 'DOC';

/** Mirrors builder/header.py HeaderBuilder. */
export class HeaderBuilder {
  private headers: Record<string, string> = {};

  static build(type: HeaderType): HeaderBuilder {
    const h = new HeaderBuilder();
    if (type === 'DOC') {
      h.headers = {
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        'sec-ch-ua': '"Microsoft Edge";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        'user-agent': UA,
      };
      return h;
    }

    h.headers['user-agent'] = UA;
    h.headers['cache-control'] = 'no-cache';
    h.headers['pragma'] = 'no-cache';
    h.headers['sec-ch-ua'] = '"Microsoft Edge";v="125", "Chromium";v="125", "Not.A/Brand";v="24"';
    h.headers['sec-ch-ua-mobile'] = '?0';
    h.headers['sec-ch-ua-platform'] = '"Windows"';
    h.headers['sec-fetch-dest'] = 'empty';
    h.headers['sec-fetch-mode'] = 'cors';
    h.headers['sec-fetch-site'] = 'same-origin';
    h.headers['priority'] = 'u=1, i';
    h.headers['accept-language'] = 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6';

    if (type === 'POST') {
      h.headers['accept'] = '*/*';
      h.headers['content-type'] = 'application/json; charset=UTF-8';
    } else if (type === 'FORM') {
      h.headers['accept'] = 'application/json, text/plain, */*';
      h.headers['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    } else if (type === 'PROTOBUF') {
      h.headers['accept'] = 'application/x-protobuf';
      h.headers['content-type'] = 'application/x-protobuf';
    } else if (type === 'GET') {
      h.headers['accept'] = 'application/json, text/plain, */*';
    }
    return h;
  }

  set(key: string, value: string): this {
    this.headers[key] = value;
    return this;
  }

  setReferer(url: string): this {
    return this.set('referer', url);
  }

  /** Attach the bd-ticket-guard headers required by IM / sensitive endpoints. */
  withBdTicketGuard(signer: Signer, api: string, auth: DouyinAuth): this {
    if (!auth.ticket || !auth.tsSign || !auth.privateKey) {
      throw new Error('bd-ticket-guard requires ticket / tsSign / privateKey on auth');
    }
    this.set('bd-ticket-guard-client-data', signer.bdTicketClientData(api, auth.ticket, auth.tsSign, auth.privateKey));
    this.set('bd-ticket-guard-iteration-version', '1');
    this.set('bd-ticket-guard-ree-public-key', signer.reeKey(auth.privateKey));
    this.set('bd-ticket-guard-version', '2');
    this.set('bd-ticket-guard-web-version', '1');
    return this;
  }

  get(): Record<string, string> {
    return this.headers;
  }
}
