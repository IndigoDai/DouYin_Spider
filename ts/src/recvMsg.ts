import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { DouyinAuth } from './auth';
import { Signer } from './signer';
import { DouyinAPI } from './api';
import { ProtoBuilder } from './protoBuilder';
import { UA } from './header';
import { spliceUrl } from './util';

const APP_KEY = 'e1bd35ec9db7b8d846de66ed140b1ad9';
const FP_ID = '9';
const ACCESS_KEY_SALT = 'f8a69f1719916z';

export interface PrivateMessage {
  index: string;
  conversationId: string;
  sender: string;
  messageType: number;
  /** Parsed content JSON (the `content` string of MessageBody, JSON.parse'd). */
  content: any;
  /** Human-friendly extraction by type, when recognized. */
  kind: 'text' | 'sticker' | 'voice' | 'image' | 'share_video' | 'read_receipt' | 'unknown';
  value?: string;
}

/**
 * Receives DouYin private messages over the Frontier WebSocket gateway.
 *
 * Two-layer protobuf: outer PushFrame (pbbp2) -> inner Response. When
 * payloadType === 'pb', Response.body.new_message_notify.message holds the
 * private message; its `content` field is a JSON string parsed per message_type.
 *
 * Events:
 *   'open'    ()
 *   'message' (PrivateMessage)
 *   'raw'     (anyDecodedObject)   // for text/json frames
 *   'error'   (Error)
 *   'close'   (code, reason)
 */
export class DouyinRecvMsg extends EventEmitter {
  private ws?: WebSocket;
  private proto: ProtoBuilder;
  private closedByUser = false;

  constructor(
    private auth: DouyinAuth,
    private signer: Signer,
    private autoReconnect = true,
  ) {
    super();
    this.proto = new ProtoBuilder(signer);
  }

  private buildUrl(deviceId: string): string {
    const accessKey = Signer.md5Hex(`${FP_ID}${APP_KEY}${deviceId}${ACCESS_KEY_SALT}`);
    const query = spliceUrl({
      aid: '6383',
      device_platform: 'douyin_pc',
      fpid: FP_ID,
      device_id: deviceId,
      token: this.auth.sessionId,
      access_key: accessKey,
    });
    return `wss://frontier-im.douyin.com/ws/v2?${query}`;
  }

  async start(): Promise<void> {
    this.closedByUser = false;
    const deviceId = await new DouyinAPI(this.auth, this.signer).getDeviceId();
    const url = this.buildUrl(deviceId);

    this.ws = new WebSocket(url, ['binary', 'base64', 'pbbp2'], {
      headers: {
        Pragma: 'no-cache',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
        'User-Agent': UA,
        'Cache-Control': 'no-cache',
        Cookie: this.auth.cookieStr,
        Origin: 'https://www.douyin.com',
      },
      origin: 'https://www.douyin.com',
      perMessageDeflate: true,
    });

    this.ws.on('open', () => this.emit('open'));
    this.ws.on('message', (data: WebSocket.RawData) => this.onMessage(data));
    this.ws.on('error', (err: Error) => {
      this.emit('error', err);
      if (this.autoReconnect && !this.closedByUser) {
        setTimeout(() => void this.start(), 1000);
      }
    });
    this.ws.on('close', (code: number, reason: Buffer) => {
      this.emit('close', code, reason.toString());
      if (this.autoReconnect && !this.closedByUser) {
        setTimeout(() => void this.start(), 1000);
      }
    });
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close();
  }

  private onMessage(data: WebSocket.RawData): void {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    let frame: { payloadType: string; payload: Uint8Array };
    try {
      frame = this.proto.decodePushFrame(new Uint8Array(buf));
    } catch (e) {
      this.emit('error', e as Error);
      return;
    }

    if (frame.payloadType === 'pb') {
      const resp = this.proto.decodeResponse(frame.payload) as any;
      const msg = resp?.body?.new_message_notify?.message;
      if (!msg) return;
      const parsed = this.parseMessage(msg);
      if (parsed) this.emit('message', parsed);
    } else if (frame.payloadType === 'text/json') {
      try {
        this.emit('raw', JSON.parse(Buffer.from(frame.payload).toString('utf-8')));
      } catch {
        /* ignore */
      }
    }
  }

  private parseMessage(msg: any): PrivateMessage | undefined {
    let content: any;
    try {
      content = JSON.parse(msg.content);
    } catch {
      content = {};
    }
    const base = {
      index: String(msg.index_in_conversation ?? ''),
      conversationId: String(msg.conversation_id ?? ''),
      sender: String(msg.sender ?? ''),
      messageType: Number(msg.message_type ?? 0),
      content,
    };

    switch (base.messageType) {
      case 7:
        return { ...base, kind: 'text', value: content.text };
      case 5:
        return { ...base, kind: 'sticker', value: content?.url?.url_list?.[0] };
      case 17:
        return { ...base, kind: 'voice', value: content?.resource_url?.url_list?.[0] };
      case 27:
        return { ...base, kind: 'image', value: content?.resource_url?.origin_url_list?.[0] };
      case 8:
        return { ...base, kind: 'share_video', value: String(content?.itemId ?? '') };
      case 50001:
        return { ...base, kind: 'read_receipt', value: String(content?.read_index ?? '') };
      default:
        return { ...base, kind: 'unknown' };
    }
  }
}
