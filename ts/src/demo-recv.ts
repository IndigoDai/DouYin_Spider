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
async function main() {
  const cfg = loadConfig();

  const auth = new DouyinAuth().prepare(cfg.cookie);
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
