import path from 'node:path';
import mysql from 'mysql2/promise';
import { config, root } from '../server/config.js';
const connection = await mysql.createConnection({ host: '127.0.0.1', port: config.database.port, user: 'root', password: process.env.MYSQL_ROOT_PASSWORD });
try {
  const [rows] = await connection.query('SELECT @@datadir AS directory');
  const expected = path.join(root, '.local/mysql/data');
  if (path.resolve(rows[0].directory).toLowerCase() !== expected.toLowerCase()) throw new Error('Refusing to stop an unmanaged database server.');
  await connection.query('SHUTDOWN');
  console.log('Project MySQL stopped. Data remains on disk.');
} finally { await connection.end(); }
