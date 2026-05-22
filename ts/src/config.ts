import fs from 'fs';
import path from 'path';

export interface AppConfig {
  /** Full document.cookie from a logged-in douyin.com session. Required. */
  cookie: string;
  /** Raw web_protect JSON (ticket / ts_sign / client_cert). Needed only to send. */
  webProtect?: string;
  /** Raw keys JSON (ec_privateKey). Needed only to send. */
  keys?: string;
  /** Recipient uid for the send demo. */
  toUid?: string;
  /** Message text for the send demo. */
  text?: string;
}

/**
 * Loads config from a JSON file. Resolution order:
 *   1. $DY_CONFIG (explicit path)
 *   2. ./config.json next to the project (cwd)
 *   3. ../config.json (when run from src/ or dist/)
 * Any field may still be overridden by the matching env var
 * (DY_COOKIE / DY_WEB_PROTECT / DY_KEYS / DY_TO_UID / DY_TEXT).
 */
export function loadConfig(): AppConfig {
  const candidates = [
    process.env.DY_CONFIG,
    path.resolve(process.cwd(), 'config.json'),
    path.resolve(__dirname, '../config.json'),
    path.resolve(__dirname, '../../config.json'),
  ].filter((p): p is string => Boolean(p));

  let fileCfg: Partial<AppConfig> = {};
  const found = candidates.find((p) => fs.existsSync(p));
  if (found) {
    fileCfg = JSON.parse(fs.readFileSync(found, 'utf-8'));
  }

  const cfg: AppConfig = {
    cookie: process.env.DY_COOKIE ?? fileCfg.cookie ?? '',
    webProtect: process.env.DY_WEB_PROTECT ?? fileCfg.webProtect,
    keys: process.env.DY_KEYS ?? fileCfg.keys,
    toUid: process.env.DY_TO_UID ?? fileCfg.toUid,
    text: process.env.DY_TEXT ?? fileCfg.text,
  };

  if (!cfg.cookie) {
    const hint = found ? `config file ${found}` : 'config.json (none found)';
    throw new Error(`Missing "cookie". Set it in ${hint} or via DY_COOKIE env var.`);
  }
  return cfg;
}
