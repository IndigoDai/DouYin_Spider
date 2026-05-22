import { DouyinAuth } from './auth';
import { Signer } from './signer';
import { DouyinRecvMsg, PrivateMessage } from './recvMsg';
import { loadConfig } from './config';

/**
 * Receive private messages in real time.
 * Reads the cookie from config.json (copy config.example.json -> config.json).
 *   npx ts-node src/demo-recv.ts
 * DY_COOKIE / DY_CONFIG env vars still override the file if set.
 */

const KIND_LABEL: Record<PrivateMessage['kind'], string> = {
  text: '文本',
  sticker: '表情包',
  voice: '语音',
  image: '图片',
  share_video: '分享视频',
  read_receipt: '已读回执',
  unknown: '未知类型',
};

const C = {
  dim: (s: string) => `\x1b[90m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function ts(): string {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

/** Pull a human-readable one-liner out of a message by its kind. */
function describe(m: PrivateMessage): string {
  switch (m.kind) {
    case 'text':
      return m.value ?? '';
    case 'sticker':
      return `表情包 ${m.value ?? ''}`;
    case 'voice': {
      const dur = m.content?.duration ?? m.content?.audio_duration;
      return `语音${dur ? ` ${dur}` : ''} ${m.value ?? ''}`;
    }
    case 'image':
      return `图片 ${m.value ?? ''}`;
    case 'share_video':
      return `分享视频 itemId=${m.value ?? ''}`;
    case 'read_receipt':
      return `对方已读至消息 #${m.value ?? ''}`;
    default:
      return JSON.stringify(m.content);
  }
}

async function main() {
  const cfg = loadConfig();

  const auth = new DouyinAuth().prepare(cfg.cookie);
  const signer = new Signer();
  const recv = new DouyinRecvMsg(auth, signer, true);

  let received = 0;

  recv.on('open', () => console.log(C.green(`[${ts()}] ✓ WebSocket 已连接，开始监听私信...`)));
  recv.on('error', (e) => console.error(C.red(`[${ts()}] ✗ 连接错误: ${e.message}`)));
  recv.on('close', (code, reason) =>
    console.log(C.yellow(`[${ts()}] ✗ 连接关闭 code=${code} reason=${reason || '(空)'}（将自动重连）`)),
  );

  recv.on('message', (m: PrivateMessage) => {
    received += 1;
    const isReceipt = m.kind === 'read_receipt';
    const head = isReceipt ? C.dim(`[${ts()}] [回执]`) : C.bold(C.cyan(`[${ts()}] [新私信 #${received}]`));

    console.log(head);
    if (!isReceipt) {
      console.log(`  发送方UID : ${C.yellow(m.sender)}`);
      console.log(`  会话ID    : ${m.conversationId}`);
      console.log(`  消息序号  : ${m.index}`);
    }
    console.log(`  类型      : ${KIND_LABEL[m.kind]} (message_type=${m.messageType})`);
    console.log(`  内容      : ${describe(m)}`);
    // 原始内容里通常还带更多字段（如图片多分辨率、语音波形等），需要时打开：
    // console.log(C.dim('  raw       : ' + JSON.stringify(m.content)));
  });

  // 非私信类的控制帧（text/json），便于调试
  recv.on('raw', (obj) => console.log(C.dim(`[${ts()}] [控制帧] ${JSON.stringify(obj)}`)));

  await recv.start();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
