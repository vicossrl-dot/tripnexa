import { mkdir, stat, writeFile } from 'node:fs/promises';
import { createWriteStream, createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
const url = 'https://dev.mysql.com/get/Downloads/MySQL-8.4/mysql-8.4.11-winx64.zip';
const target = '.local/mysql/mysql-8.4.11-winx64.zip';
await mkdir('.local/mysql', { recursive: true });
if (!(await stat(target).catch(() => null))) {
  const response = await fetch(url, { signal: AbortSignal.timeout(600000) });
  if (!response.ok) throw new Error(`Official MySQL download failed: HTTP ${response.status}`);
  const host = new URL(response.url).hostname;
  if (!(host === 'mysql.com' || host.endsWith('.mysql.com') || host.endsWith('.oracle.com'))) throw new Error('Unexpected download host.');
  const total = Number(response.headers.get('content-length') || 0);
  console.log(`Downloading official MySQL archive (${Math.round(total / 1024 / 1024)} MB).`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target, { flags: 'wx' }));
}
const hash = createHash('sha256');
for await (const chunk of createReadStream(target)) hash.update(chunk);
const sha256 = hash.digest('hex');
await writeFile('.local/mysql/download-manifest.json', JSON.stringify({ url, sha256 }, null, 2));
console.log('Archive downloaded; SHA-256 recorded in .local/mysql/download-manifest.json.');
