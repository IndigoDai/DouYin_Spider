# DouYin IM — TypeScript port

A faithful TypeScript reimplementation of this repo's DouYin private-message
stack:

- **Receive** private messages in real time over the Frontier WebSocket
  (`wss://frontier-im.douyin.com/ws/v2`), decoding the two-layer protobuf
  (`PushFrame` → `Response` → `MessageBody`) and dispatching by `message_type`
  (text / sticker / voice / image / shared video / read-receipt).
- **Send** private messages over the `imapi.douyin.com` HTTP endpoints
  (`v2/conversation/create` cmd 609, then `v1/message/send` cmd 100) with the
  full `bd-ticket-guard` end-to-end signing envelope.

## How the signatures work

The risk-control signatures (`a_bogus`, `bd-ticket-guard` ECDSA `req_sign`,
`ree_public_key`) cannot be reimplemented in pure TS — they *are* the
reverse-engineered obfuscated logic. This port reuses the original
`static/dy_ab.js` by loading it into a Node `vm` context and pulling out
`get_ab` / `get_req_sign` / `get_ree_key` (see `src/signer.ts`). The only
external dependency that file needs is `jsrsasign`.

By default the signer locates `dy_ab.js` via `../../static`. Override with the
`DY_STATIC_DIR` environment variable if you move things around.

## Install

```bash
cd ts
npm install
cp config.example.json config.json   # then fill in your credentials
```

## Configuration

Both demos read credentials from `config.json` (gitignored). Copy the template
and fill in the fields:

```jsonc
{
  "cookie":     "sessionid=...; s_v_web_id=verify_...; msToken=...; ttwid=...",
  "webProtect": "{\"data\":\"{...ticket / ts_sign / client_cert...}\"}",  // send only
  "keys":       "{\"data\":\"{...ec_privateKey...}\"}",                    // send only
  "toUid":      "123456789",                                               // send demo
  "text":       "hello"                                                    // send demo
}
```

Resolution order: `$DY_CONFIG` → `./config.json` → project `config.json`. Any
field can still be overridden by the matching env var
(`DY_COOKIE` / `DY_WEB_PROTECT` / `DY_KEYS` / `DY_TO_UID` / `DY_TEXT`).

## Receive private messages

Only `cookie` is required.

```bash
npx ts-node src/demo-recv.ts
```

## Send a private message

Additionally requires the `bd-ticket-guard` material (`webProtect` + `keys`,
the same blobs the Python version uses) and `toUid` in `config.json`.

```bash
npx ts-node src/demo-send.ts
```

## Programmatic use

```ts
import { DouyinAuth, Signer, DouyinAPI, DouyinRecvMsg } from './src';

const auth = new DouyinAuth().prepare(cookie /*, webProtect, keys */);
const signer = new Signer();

// receive
const recv = new DouyinRecvMsg(auth, signer);
recv.on('message', (m) => console.log(m.kind, m.value));
await recv.start();

// send
const api = new DouyinAPI(auth, signer);
await api.sendTextTo('123456789', 'hi');
```

## Layout

| file | responsibility | Python counterpart |
|------|----------------|--------------------|
| `src/signer.ts`      | JS signature bridge + md5/msToken | `utils/dy_util.py` |
| `src/auth.ts`        | cookie / ticket / private-key holder | `builder/auth.py` |
| `src/params.ts`      | ordered query-param builder | `builder/params.py` |
| `src/header.ts`      | HTTP header + bd-ticket-guard headers | `builder/header.py` |
| `src/protoBuilder.ts`| protobuf load + request builders | `builder/proto.py` |
| `src/api.ts`         | device id, uid, create/send (HTTP) | `dy_apis/douyin_api.py` |
| `src/recvMsg.ts`     | Frontier WebSocket receiver | `dy_apis/douyin_recv_msg.py` |

> The protobuf parsing, message-type table, and signing flow are unit-tested
> offline. Live endpoints require valid credentials and are subject to DouYin's
> risk control; `dy_ab.js` will eventually need refreshing as the site updates.
