import { DouyinAuth } from './auth';
import { Signer } from './signer';
import { DouyinRecvMsg, PrivateMessage } from './recvMsg';

/**
 * Receive private messages in real time.
 * Set DY_COOKIE to your logged-in douyin.com cookie string.
 *   DY_COOKIE="sessionid=...; s_v_web_id=...; ..." npx ts-node src/demo-recv.ts
 */
async function main() {
  const cookie = process.env.DY_COOKIE;
  if (!cookie) throw new Error('Set DY_COOKIE env var to your douyin.com cookie string');

  const auth = new DouyinAuth().prepare(cookie);
  const signer = new Signer();
  const recv = new DouyinRecvMsg(auth, signer, true);

  recv.on('open', () => console.log('[ws] connected'));
  recv.on('error', (e) => console.error('[ws] error', e.message));
  recv.on('close', (code, reason) => console.log('[ws] closed', code, reason));
  recv.on('message', (m: PrivateMessage) => {
    console.log(
      `[#${m.index}][conv:${m.conversationId}][from:${m.sender}] ${m.kind}: ${m.value ?? JSON.stringify(m.content)}`,
    );
  });

  await recv.start();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
