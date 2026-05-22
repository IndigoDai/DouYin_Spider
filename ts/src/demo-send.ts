import { DouyinAuth } from './auth';
import { Signer } from './signer';
import { DouyinAPI } from './api';

/**
 * Send a private message.
 * Requires extra captured tokens beyond the cookie (bd-ticket-guard):
 *   DY_COOKIE       - douyin.com cookie string
 *   DY_WEB_PROTECT  - raw web_protect JSON (contains ticket / ts_sign / client_cert)
 *   DY_KEYS         - raw keys JSON (contains ec_privateKey)
 *   DY_TO_UID       - recipient user id
 *   DY_TEXT         - message text (default "hello")
 */
async function main() {
  const cookie = process.env.DY_COOKIE;
  const webProtect = process.env.DY_WEB_PROTECT ?? '';
  const keys = process.env.DY_KEYS ?? '';
  const toUid = process.env.DY_TO_UID;
  const text = process.env.DY_TEXT ?? 'hello';
  if (!cookie || !webProtect || !keys || !toUid) {
    throw new Error('Set DY_COOKIE, DY_WEB_PROTECT, DY_KEYS, DY_TO_UID');
  }

  const auth = new DouyinAuth().prepare(cookie, webProtect, keys);
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
