import path from 'path';
import { randomUUID } from 'crypto';
import protobuf from 'protobufjs';
import { DouyinAuth } from './auth';
import { Signer } from './signer';
import { UA } from './header';
import { findProtoDir, nowMillis } from './util';

/** Loads the .proto schemas once and builds the IM protobuf request bodies. */
export class ProtoBuilder {
  readonly root: protobuf.Root;
  readonly Request: protobuf.Type;
  readonly Response: protobuf.Type;
  readonly PushFrame: protobuf.Type;

  constructor(private signer: Signer) {
    const dir = findProtoDir();
    this.root = new protobuf.Root();
    this.root.loadSync(
      [path.join(dir, 'Request.proto'), path.join(dir, 'Response.proto'), path.join(dir, 'Live.proto')],
      { keepCase: true },
    );
    this.Request = this.root.lookupType('Request');
    this.Response = this.root.lookupType('Response');
    this.PushFrame = this.root.lookupType('PushFrame');
  }

  encodeRequest(payload: Record<string, unknown>): Uint8Array {
    const err = this.Request.verify(payload);
    if (err) throw new Error(`Request verify failed: ${err}`);
    return this.Request.encode(this.Request.create(payload)).finish();
  }

  decodeResponse(buf: Uint8Array): Record<string, unknown> {
    const msg = this.Response.decode(buf);
    return this.Response.toObject(msg, { longs: String, bytes: String, defaults: true });
  }

  decodePushFrame(buf: Uint8Array): { payloadType: string; payload: Uint8Array } {
    const msg = this.PushFrame.decode(buf) as unknown as { payloadType: string; payload: Uint8Array };
    return { payloadType: msg.payloadType, payload: msg.payload };
  }

  /** Common Request envelope, mirrors ProtoBuilder.build_normal_request. */
  private normalRequest(auth: DouyinAuth, cmd: number, webid: string): Record<string, unknown> {
    if (!auth.ticket || !auth.tsSign || !auth.clientCert) {
      throw new Error('Sending requires ticket / tsSign / clientCert on auth');
    }
    return {
      cmd,
      sequence_id: Math.floor(Math.random() * 1000) + 10000,
      sdk_version: '1.1.3',
      token: auth.ticket,
      refer: 3,
      inbox_type: 0,
      build_number: '5fa6ff1:Detached: 5fa6ff1111fd53aafc4c753505d3c93daad74d27',
      device_id: '0',
      device_platform: 'douyin_pc',
      auth_type: 4,
      biz: 'douyin_web',
      access: 'web_sdk',
      ts_sign: auth.tsSign,
      sdk_cert: Buffer.from(auth.clientCert, 'utf-8').toString('base64'),
      headers: {
        session_aid: '6383',
        session_did: '0',
        app_name: 'douyin_pc',
        priority_region: 'cn',
        user_agent: UA,
        cookie_enabled: 'true',
        browser_language: 'zh-CN',
        browser_platform: 'Win32',
        browser_name: 'Mozilla',
        browser_version: UA.split('Mozilla/').pop() ?? '',
        browser_online: 'true',
        screen_width: '1707',
        screen_height: '960',
        referer: '',
        timezone_name: 'Etc/GMT-8',
        deviceId: '0',
        webid,
        fp: auth.sVWebId,
        'is-retry': '0',
      },
    };
  }

  /** cmd 609 create_conversation. */
  buildCreateConversation(auth: DouyinAuth, toId: number | string, myId: number | string, webid: string): Uint8Array {
    const req = this.normalRequest(auth, 609, webid);
    req.body = {
      create_conversation_v2_body: {
        conversation_type: 1,
        participants: [String(toId), String(myId)],
      },
    };
    req.reuqest_sign = this.signer.reqSign(
      `avatar_url=&idempotent_id=&name=&participants=${toId},${myId}`,
      auth.privateKey!,
    );
    return this.encodeRequest(req);
  }

  /** cmd 100 send text message (message_type 7). */
  buildSendMessage(
    auth: DouyinAuth,
    conversationId: string,
    conversationShortId: string,
    ticket: string,
    text: string,
    webid: string,
  ): Uint8Array {
    const clientMessageId = randomUUID();
    const msgContent = {
      mention_users: [],
      aweType: 700,
      richTextInfos: [],
      text,
    };
    const contentStr = JSON.stringify(msgContent);

    const req = this.normalRequest(auth, 100, webid);
    req.body = {
      send_message_body: {
        conversation_id: conversationId,
        conversation_type: 1,
        conversation_short_id: conversationShortId,
        content: contentStr,
        ext: [
          { key: 's:client_message_id', value: clientMessageId },
          { key: 's:stime', value: String(nowMillis()) },
          { key: 's:mentioned_users', value: '' },
        ],
        message_type: 7,
        ticket,
        client_message_id: clientMessageId,
      },
    };
    req.reuqest_sign = this.signer.reqSign(
      `content=${contentStr}&conversation_id=${conversationId}&conversation_short_id=${conversationShortId}`,
      auth.privateKey!,
    );
    return this.encodeRequest(req);
  }
}
