import https from 'https';
import axios, { AxiosInstance } from 'axios';
import { DouyinAuth } from './auth';
import { Signer } from './signer';
import { Params } from './params';
import { HeaderBuilder } from './header';
import { ProtoBuilder } from './protoBuilder';
import { spliceUrl } from './util';

const insecureAgent = new https.Agent({ rejectUnauthorized: false });

export interface Conversation {
  conversationId: string;
  conversationShortId: string;
  ticket: string;
}

/** HTTP side of DouYin IM: device id, uid, create conversation, send message. */
export class DouyinAPI {
  private http: AxiosInstance;
  private proto: ProtoBuilder;

  constructor(
    private auth: DouyinAuth,
    private signer: Signer,
  ) {
    this.proto = new ProtoBuilder(signer);
    this.http = axios.create({
      httpsAgent: insecureAgent,
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: () => true,
    });
  }

  private cookieHeader(extra: Record<string, string> = {}): Record<string, string> {
    return { Cookie: this.auth.cookieStr, ...extra };
  }

  /** Best-effort webid like generate_webid; falls back to a fake numeric id. */
  async fetchWebId(url = 'https://www.douyin.com/discover?modal_id=7376449060384935209'): Promise<string> {
    try {
      const headers = HeaderBuilder.build('DOC').set('cookie', this.auth.cookieStr).get();
      const resp = await this.http.get<string>(url, { headers, responseType: 'text' });
      const m = /\\"user_unique_id\\":\\"(.*?)\\"/.exec(resp.data);
      if (m) return m[1];
    } catch {
      /* fall through */
    }
    return Signer.fakeWebId();
  }

  /** GET /aweme/v1/web/query/user -> device id (the `id` field). */
  async getDeviceId(): Promise<string> {
    const refer = 'https://www.douyin.com/discover';
    const webid = await this.fetchWebId(refer);
    const params = new Params(this.signer)
      .withPlatform()
      .add('publish_video_strategy_type', '2')
      .withWebId(webid)
      .withMsToken()
      .withFp(this.auth)
      .withABogus();
    const headers = HeaderBuilder.build('GET').setReferer(refer).get();
    const resp = await this.http.get('https://www.douyin.com/aweme/v1/web/query/user', {
      params: params.get(),
      headers: this.cookieHeader(headers),
    });
    return String(resp.data.id);
  }

  /** GET /aweme/v1/web/query/user/ -> my uid (user_uid). Also caches it on auth. */
  async getMyUid(): Promise<number> {
    const refer = 'https://www.douyin.com/';
    const webid = await this.fetchWebId(refer);
    const params = new Params(this.signer)
      .withPlatform()
      .withWebId(webid)
      .withMsToken()
      .withFp(this.auth)
      .withABogus();
    const headers = HeaderBuilder.build('GET').setReferer(refer).get();
    const resp = await this.http.get('https://www.douyin.com/aweme/v1/web/query/user/', {
      params: params.get(),
      headers: this.cookieHeader(headers),
    });
    const uid = parseInt(String(resp.data.user_uid), 10);
    this.auth.setUid(uid);
    return uid;
  }

  /** cmd 609 POST imapi/v2/conversation/create -> {id, shortId, ticket}. */
  async createConversation(toUserId: number | string): Promise<Conversation> {
    const myId = this.auth.uid;
    const webid = await this.fetchWebId('https://www.douyin.com/');
    const body = this.proto.buildCreateConversation(this.auth, toUserId, myId, webid);
    const headers = HeaderBuilder.build('PROTOBUF').setReferer('https://www.douyin.com/').get();
    const resp = await this.http.post('https://imapi.douyin.com/v2/conversation/create', body, {
      headers: this.cookieHeader(headers),
      responseType: 'arraybuffer',
    });
    const obj = this.proto.decodeResponse(new Uint8Array(resp.data)) as any;
    const info = obj?.body?.create_conversation_v2_body?.conversation_info_list?.[0];
    if (!info) throw new Error(`createConversation: unexpected response ${JSON.stringify(obj)}`);
    return {
      conversationId: info.conversation_id,
      conversationShortId: String(info.conversation_short_id),
      ticket: info.ticket,
    };
  }

  /** cmd 100 POST imapi/v1/message/send. Returns the decoded response object. */
  async sendMessage(conv: Conversation, text: string): Promise<Record<string, unknown>> {
    const webid = await this.fetchWebId('https://www.douyin.com/');
    const body = this.proto.buildSendMessage(
      this.auth,
      conv.conversationId,
      conv.conversationShortId,
      conv.ticket,
      text,
      webid,
    );
    const queryParams: Record<string, string> = {
      verifyFp: this.auth.sVWebId,
      fp: this.auth.sVWebId,
      msToken: Signer.msToken(),
    };
    queryParams['a_bogus'] = this.signer.aBogus(spliceUrl(queryParams));
    const headers = HeaderBuilder.build('PROTOBUF').setReferer('https://www.douyin.com/').get();
    const resp = await this.http.post('https://imapi.douyin.com/v1/message/send', body, {
      params: queryParams,
      headers: this.cookieHeader(headers),
      responseType: 'arraybuffer',
    });
    return this.proto.decodeResponse(new Uint8Array(resp.data));
  }

  /** Convenience: create the 1:1 conversation then send a text message. */
  async sendTextTo(toUserId: number | string, text: string): Promise<Record<string, unknown>> {
    try {
      this.auth.uid;
    } catch {
      await this.getMyUid();
    }
    const conv = await this.createConversation(toUserId);
    return this.sendMessage(conv, text);
  }
}
