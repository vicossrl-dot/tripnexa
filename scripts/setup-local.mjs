import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
let content = await readFile('.env.example', 'utf8');
content = content.replace(/^MYSQL_PASSWORD=$/m, `MYSQL_PASSWORD=${randomBytes(24).toString('hex')}`)
  .replace(/^MYSQL_ROOT_PASSWORD=$/m, `MYSQL_ROOT_PASSWORD=${randomBytes(24).toString('hex')}`);
try { await writeFile('.env', content, { flag: 'wx', mode: 0o600 }); console.log('Created .env with random local database passwords. No secrets printed.'); }
catch (error) { if (error.code === 'EEXIST') console.log('.env already exists; left unchanged.'); else throw error; }
