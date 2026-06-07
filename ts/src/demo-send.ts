import { DouyinAuth } from './auth';
import { Signer } from './signer';
import { DouyinAPI } from './api';
import { loadConfig } from './config';

/**
 * Send a private message.
 * Reads cookie + bd-ticket-guard material from config.json
 * (copy config.example.json -> config.json and fill in cookie / webProtect /
 * keys / toUid / text). Env vars still override individual fields.
 */
async function main() {
  const cfg = loadConfig();
  const webProtect = cfg.webProtect ?? '';
  const keys = cfg.keys ?? '';
  const toUid = cfg.toUid;
  const text = cfg.text ?? 'hello';
  if (!webProtect || !keys || !toUid) {
    throw new Error('Sending needs webProtect, keys and toUid in config.json (or DY_WEB_PROTECT / DY_KEYS / DY_TO_UID).');
  }

  const auth = new DouyinAuth().prepare(cfg.cookie, webProtect, keys);
  const signer = new Signer();
  const api = new DouyinAPI(auth, signer);

  const uid = await api.getMyUid();
  console.log('[send] my uid =', uid);
  const conv = await api.createConversation(toUid);
  console.log('[send] conversation =', conv);
  const resp = await api.sendMessage(conv, text);
  console.log('[send] response =', JSON.stringify(resp));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
