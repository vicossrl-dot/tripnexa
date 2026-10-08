import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {serverCatalogs,messageRows} from '../src/i18n/server-messages.js';
import {extraServerCatalogs} from '../src/i18n/server-extra.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const supported = ['en', 'ro', 'ru', 'de', 'fr', 'es'];
const read = locale => JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/locales', locale + '.json'), 'utf8'));
const english = read('en');
const keys = Object.keys(english).sort();
const placeholders = text => [...text.matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]).sort().join(',');
const errors = [];
for(const locale of supported){if(Object.keys(extraServerCatalogs[locale]).sort().join('|')!==Object.keys(extraServerCatalogs.en).sort().join('|'))errors.push(`${locale}: extra server key parity`);}
const messageKeys=new Set();
for(const row of messageRows){if(messageKeys.has(row[0]))errors.push('Duplicate server key: '+row[0]);messageKeys.add(row[0]);if(row.length!==7||row.slice(1).some(value=>typeof value!=='string'||!value.trim()))errors.push('Incomplete server key: '+row[0]);}
for(const locale of supported)for(const key of Object.keys(serverCatalogs.en))if(placeholders(serverCatalogs[locale][key])!==placeholders(serverCatalogs.en[key]))errors.push(`${locale}: server placeholders ${key}`);
for (const locale of supported) {
  const catalog = read(locale);
  for (const key of keys) {
    if (typeof catalog[key] !== 'string' || !catalog[key].trim()) errors.push(`${locale}: missing/empty ${key}`);
    else if (placeholders(catalog[key]) !== placeholders(english[key])) errors.push(`${locale}: placeholders ${key}`);
  }
  for (const key of Object.keys(catalog)) if (!Object.hasOwn(english, key)) errors.push(`${locale}: unexpected ${key}`);
}
function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'admin' || entry.name === 'locales') continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) inspect(filename);
    else if (/\.(jsx?|mjs)$/.test(filename) && entry.name !== 'Admin.jsx') {
      const source = fs.readFileSync(filename, 'utf8');
      for (const match of source.matchAll(/\bt\(['"]([^'"]+)['"]\s*(?=[,)])/g)) {
        if (!Object.hasOwn(english, match[1]) && !Object.hasOwn(english, match[1] + '.one') && !messageKeys.has(match[1])) errors.push(`${path.relative(root, filename)}: unknown ${match[1]}`);
      }
    }
  }
}
inspect(path.join(root, 'src'));
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`i18n: ${keys.length} UI keys + ${messageKeys.size} shared server keys; six locales; key and interpolation parity passed.`);
