import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, stat, unlink } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { config, root } from '../server/config.js';

const directory = path.join(root, '.local/mysql');
const basedir = path.join(directory, 'mysql-8.4.11-winx64');
const datadir = path.join(directory, 'data');
const executable = path.join(basedir, 'bin/mysqld.exe');
const marker = path.join(directory, 'managed-instance.json');
const initialized = path.join(directory, 'bootstrap-complete');
const ini = path.join(directory, 'my.ini');
const initFile = path.join(directory, 'bootstrap.sql');
const slash = value => value.replaceAll('\\', '/');
if (process.platform !== 'win32') throw new Error('This launcher is for the project-local Windows distribution. Use Docker Compose on other platforms.');
if (!['localhost','127.0.0.1'].includes(config.database.host)) throw new Error('The portable launcher only manages a loopback database.');
if (!process.env.MYSQL_ROOT_PASSWORD || !config.database.password) throw new Error('Run node scripts/setup-local.mjs first.');
if (!/^[a-zA-Z0-9_]+$/.test(config.database.database) || !/^[a-zA-Z0-9_]+$/.test(config.database.user)) throw new Error('Use letters, digits and underscores for local database/user names.');
await stat(executable).catch(() => { throw new Error('Download and extract the official MySQL archive first; see README.md.'); });
await mkdir(directory, { recursive: true });
const adminConfig = { host: '127.0.0.1', port: config.database.port, user: 'root', password: process.env.MYSQL_ROOT_PASSWORD, connectTimeout: 1500 };
async function connectOwn() {
  const connection = await mysql.createConnection(adminConfig);
  const [rows] = await connection.query('SELECT @@datadir AS directory');
  if (path.resolve(rows[0].directory).toLowerCase() !== path.resolve(datadir).toLowerCase()) {
    await connection.end(); throw new Error('The configured port belongs to another MySQL instance.');
  }
  return connection;
}
try {
  const existing = await connectOwn(); await existing.end();
  console.log('Project MySQL is already running.'); process.exit(0);
} catch (error) {
  if (!['ECONNREFUSED','ETIMEDOUT'].includes(error.code)) throw error;
}
if (!(await stat(marker).catch(() => null))) {
  if (await stat(datadir).catch(() => null)) throw new Error('Unmanaged data directory exists. Refusing to initialize or overwrite it.');
  await writeFile(marker, JSON.stringify({ basedir, datadir, version: '8.4.11' }, null, 2), { flag: 'wx' });
} else {
  const managed = JSON.parse(await readFile(marker, 'utf8'));
  if (managed.datadir !== datadir || managed.basedir !== basedir) throw new Error('Managed instance paths do not match.');
}
await writeFile(ini, `[mysqld]\nbasedir=${slash(basedir)}\ndatadir=${slash(datadir)}\nport=${config.database.port}\nbind-address=127.0.0.1\nmysqlx=0\nskip-log-bin\ninnodb-buffer-pool-size=128M\nmax-connections=50\nlog-error=${slash(path.join(directory, 'mysql.log'))}\n`);
if (!(await stat(datadir).catch(() => null))) {
  console.log('Initializing the project MySQL data directory.');
  await new Promise((resolve, reject) => {
    const child = spawn(executable, [`--defaults-file=${ini}`, '--initialize-insecure'], { windowsHide: true, stdio: 'ignore' });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error('MySQL initialization failed. See .local/mysql/mysql.log.')));
  });
}
const bootstrap = !(await stat(initialized).catch(() => null));
if (bootstrap) {
  const database = config.database.database;
  const username = mysql.escape(config.database.user);
  const password = mysql.escape(config.database.password);
  const rootPassword = mysql.escape(process.env.MYSQL_ROOT_PASSWORD);
  await writeFile(initFile, [
    `ALTER USER 'root'@'localhost' IDENTIFIED BY ${rootPassword};`,
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`,
    `CREATE DATABASE IF NOT EXISTS \`${database}_test\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`,
    `CREATE USER IF NOT EXISTS ${username}@'localhost' IDENTIFIED BY ${password};`,
    `CREATE USER IF NOT EXISTS ${username}@'127.0.0.1' IDENTIFIED BY ${password};`,
    `GRANT ALL PRIVILEGES ON \`${database}\`.* TO ${username}@'localhost', ${username}@'127.0.0.1';`,
    `GRANT ALL PRIVILEGES ON \`${database}_test\`.* TO ${username}@'localhost', ${username}@'127.0.0.1';`,
  ].join('\n') + '\n', { mode: 0o600 });
}
const log = openSync(path.join(directory, 'process.log'), 'a');
const child = spawn(executable, [`--defaults-file=${ini}`, ...(bootstrap ? [`--init-file=${initFile}`] : [])], { windowsHide: true, detached: true, stdio: ['ignore', log, log] });
child.on('error', error => console.error('MySQL startup failed:', error.code));
child.unref(); closeSync(log);
await writeFile(path.join(directory, 'mysql.pid'), String(child.pid));
let connection;
for (let attempt=0;attempt<60;attempt++) {
  try { connection = await connectOwn(); break; } catch { await new Promise(resolve => setTimeout(resolve, 500)); }
}
if (!connection) throw new Error('MySQL did not become ready. See .local/mysql/mysql.log.');
await connection.end();
if (bootstrap) { await writeFile(initialized, 'ready\n'); await unlink(initFile); }
console.log(`Project MySQL is ready at 127.0.0.1:${config.database.port}. No Windows service was installed.`);
