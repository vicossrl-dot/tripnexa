import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const execute = promisify(execFile);

test('offline import validates owners, references and local avatar mapping before writing', async () => {
  const directory = path.resolve('.local/import-tests', randomUUID());
  await mkdir(directory, { recursive: true });
  const avatar = 'https://media.base44.com/example/avatar.png';
  const data = {
    User: [{ id: 'old-user', email: 'old-user@example.test', avatar_url: avatar }],
    Trip: [{ id: 'old-trip', name: 'Trip', created_by_id: 'old-user' }],
    TripItem: [{ id: 'old-item', title: 'Hotel', category: 'stay', trip_id: 'old-trip' }],
  };
  await writeFile(path.join(directory, 'avatar.png'), Buffer.from([137,80,78,71,13,10,26,10]));
  await writeFile(path.join(directory, 'files.json'), JSON.stringify({ [avatar]: 'avatar.png' }));
  const source = path.join(directory, 'export.json');
  await writeFile(source, JSON.stringify(data));
  const args = ['scripts/import-data.mjs', source, '--media-map=' + path.join(directory, 'files.json')];
  const { stdout } = await execute(process.execPath, args);
  assert.match(stdout, /Validated 1 users, 2 records and 1 files/);
  assert.match(stdout, /Dry run only/);
  data.TripItem[0].trip_id = 'missing';
  await writeFile(source, JSON.stringify(data));
  await assert.rejects(() => execute(process.execPath, args), error => error.stderr.includes('Missing parent'));
  data.TripItem[0].trip_id = 'old-trip';
  data.Trip[0].created_by_id = 'unknown-user';
  await writeFile(source, JSON.stringify(data));
  await assert.rejects(() => execute(process.execPath, args), error => error.stderr.includes('Unknown owner'));
});
