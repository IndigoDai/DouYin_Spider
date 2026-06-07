# 交接文档 — 抖音私信收发 TypeScript 实现

> 最后更新：2026-05-22 ｜ 分支：`claude/gifted-dirac-3Dhx2` ｜ 状态：本地验证通过，未做真实联网端到端测试

## 1. 这个任务是什么

把本仓库（原 Python 项目）的**抖音私信收发能力**用 TypeScript 完整复刻，放在新目录 `ts/`。

两条独立通道：
- **接收**私信：WebSocket 长连接 `wss://frontier-im.douyin.com/ws/v2`，两层 protobuf 解码（`PushFrame` → `Response` → `MessageBody`），按 `message_type` 分流（文本/表情包/语音/图片/分享视频/已读回执）。
- **发送**私信：HTTP POST 到 `imapi.douyin.com`（先 cmd 609 建会话，再 cmd 100 发消息），带 `bd-ticket-guard` 端到端 ECDSA 验签。

## 2. 当前进度（已完成）

- [x] `ts/` 完整实现 + 编译通过（`npx tsc --noEmit` 干净）
- [x] 离线验证：签名桥接（a_bogus / req_sign / ree_key）、proto 往返、md5/msToken、cookie 解析
- [x] 配置从 `config.json` 读取（env 可覆盖），`config.json` 已 gitignore
- [x] `demo-recv.ts` 日志丰富化（含发送方 UID、中文类型标签、时间戳、颜色）
- [x] 修复：hex 格式 `ec_privateKey` 自动转 PKCS#8 PEM（否则 jsrsasign 报 `not supported argument`）

## 3. 未完成 / 待验证（从这里继续）

1. **真实联网端到端测试**（最重要）：我无法获取有效 cookie/web_protect/keys，所以从未真正连上抖音收发。需要用真实凭据跑：
   - `npx ts-node src/demo-recv.ts` 看能否收到私信
   - `npx ts-node src/demo-send.ts` 看 `[send] response` 是否成功（关注返回里的 `error_desc`，空字符串才算成功）
2. 若发送返回非空 `error_desc`：多半是凭据时效/风控问题，需重新从浏览器同一会话抓 `webProtect`+`keys`+cookie。
3. 可选增强：语音/图片消息的下载、发送非文本消息、已读回执主动上报、心跳/重连健壮性（当前接收通道未发心跳，靠服务端推送；直播通道才有 hb/ack）。

## 4. 关键架构与"为什么"

### 签名体系（最容易踩坑的地方）
抖音三个核心风控签名来自逆向出的混淆 JS `static/dy_ab.js`（54万字符，VMP 混淆），**不能也不该用 TS 重写**。`src/signer.ts` 把这个 JS 加载进 Node `vm` 沙箱，取出三个函数复用：
- `get_ab(query, data)` → `a_bogus`（web 请求风控签名）
- `get_req_sign(signData, prik)` → SHA256withECDSA 签名（bd-ticket-guard）
- `get_ree_key(prik)` → 从私钥导出 ree 公钥

沙箱需要补 `performance`、`Buffer` 等全局，并注入 `jsrsasign`（`signer.ts:40-58`）。这与原 Python 用 execjs 跑同一个 JS 是**对等实现**。

### 私钥格式坑（已修，但要知道）
douyin 的 `keys.ec_privateKey` 可能是**裸 hex**（P-256 的 d 值），jsrsasign 不认。`auth.ts` 的 `normalizePrivateKey()` 检测到非 PEM 的 hex 就转成 PKCS#8 PEM。如果将来遇到 base64-DER 等其它格式，在这个函数里加分支。

### protobuf
用 `protobufjs` + **`keepCase: true`** 加载 `.proto`（`protoBuilder.ts:30`），保证字段是 snake_case，和 `.proto`/Python/我的代码一致。若忘了 keepCase，字段会变 camelCase，body 解不出来（这个坑我踩过）。

### 发送的两步流程
1. cmd 609 `imapi/v2/conversation/create` → 拿 `conversation_id / conversation_short_id / ticket`
2. cmd 100 `imapi/v1/message/send`，content 是内嵌 JSON `{"text":..., "aweType":700, ...}`，`message_type=7`

## 5. 文件地图

| 文件 | 职责 | 对应 Python |
|------|------|------|
| `src/signer.ts` | dy_ab.js 签名桥 + md5/msToken/bd-ticket 信封 | `utils/dy_util.py` |
| `src/auth.ts` | cookie/ticket/私钥持有 + 私钥归一化 | `builder/auth.py` |
| `src/params.ts` | 有序 query 构造 + a_bogus | `builder/params.py` |
| `src/header.ts` | HTTP 头 + bd-ticket-guard 头 | `builder/header.py` |
| `src/protoBuilder.ts` | protobuf 加载 + cmd 609/100 请求构造 | `builder/proto.py` |
| `src/api.ts` | device_id/uid/建会话/发消息（axios，关TLS校验） | `dy_apis/douyin_api.py` |
| `src/recvMsg.ts` | Frontier WebSocket 接收 + 解码 + 分流（EventEmitter） | `dy_apis/douyin_recv_msg.py` |
| `src/config.ts` | 从 config.json 读凭据（env 覆盖） | `utils/common_util.py` (.env) |
| `src/demo-recv.ts` / `src/demo-send.ts` | 两个可运行示例 | — |
| `proto/*.proto` | Request/Response/Live schema（从 static/ 复制） | `static/*.proto` |

## 6. 怎么跑

```bash
cd ts
npm install
cp config.example.json config.json   # 填入真实凭据
npx ts-node src/demo-recv.ts          # 收（只需 cookie）
npx ts-node src/demo-send.ts          # 发（另需 webProtect / keys / toUid）
```

`config.json` 字段：`cookie`（必填）、`webProtect`/`keys`/`toUid`/`text`（发送用）。
`signer.ts` 默认从 `../../static/dy_ab.js` 找签名 JS；移动位置用 `DY_STATIC_DIR` 覆盖。

## 7. 提交历史（本会话）

```
afa905b Normalize hex ec_privateKey to PEM before ECDSA signing
90cf8d2 Update README to document config.json usage for both demos
7237524 Enrich demo-recv logging with sender UID and structured output
13060d0 Read demo credentials from config.json instead of env vars
9f11e9f Add TypeScript port of DouYin private-message receive/send
```

全部已推送到 `origin/claude/gifted-dirac-3Dhx2`。

## 8. 新会话第一步建议

1. 读本文档 + `ts/README.md`。
2. 若有真实凭据：填 `config.json` → 跑 `demo-recv` 和 `demo-send`，把 `[send] response` 贴出来定位问题。
3. 若收发不通：优先怀疑 (a) 凭据时效，(b) `dy_ab.js` 因抖音更新失效，(c) header/param 与最新 web 端不一致。先用 `websocket`/抓包对比真实浏览器请求。
