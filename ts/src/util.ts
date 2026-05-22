import fs from 'fs';
import path from 'path';

/** Return the first existing path among the candidates, else throw. */
export function resolveExisting(candidates: string[], what: string): string {
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(`Could not locate ${what}. Tried:\n  ${candidates.join('\n  ')}`);
}

/** Locate the original repo's static/ dir, which holds dy_ab.js and the node_modules with jsrsasign. */
export function findStaticDir(): string {
  const envDir = process.env.DY_STATIC_DIR;
  const candidates = [
    ...(envDir ? [envDir] : []),
    path.resolve(__dirname, '../../static'), // running from dist/ or src/ via ts-node
    path.resolve(__dirname, '../../../static'),
    path.resolve(process.cwd(), '../static'),
    path.resolve(process.cwd(), 'static'),
  ];
  return resolveExisting(candidates, 'the project static/ directory (set DY_STATIC_DIR to override)');
}

/** Locate ts/proto dir holding the .proto schemas. */
export function findProtoDir(): string {
  const candidates = [
    path.resolve(__dirname, '../proto'), // dist/ -> ../proto, src/ -> ../proto
    path.resolve(__dirname, '../../proto'),
    path.resolve(process.cwd(), 'proto'),
  ];
  return resolveExisting(candidates, 'the proto/ directory');
}

/** urllib.parse.quote-compatible spliced query string, preserving insertion order. */
export function spliceUrl(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v === undefined ? '' : String(v))}`)
    .join('&');
}

export function nowMillis(): number {
  return Date.now();
}
