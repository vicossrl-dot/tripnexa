import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
// One-time migration utility. The application never contacts the original host.
for (const file of ['src/pages/Home.jsx', 'src/components/trip/MobileIntro.jsx']) {
  const original = await readFile(path.join('migration-backup', file), 'utf8');
  let current = await readFile(file, 'utf8');
  const urls = [...new Set(original.match(/https:\/\/media\.base44\.com\/[^"\s]+/g) || [])];
  await mkdir('public/media', { recursive: true });
  for (const url of urls) {
    const filename = new URL(url).pathname.split('/').pop();
    const output = path.join('public/media', filename);
    if (!(await stat(output).catch(() => null))) {
      const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`Download failed (${response.status}): ${filename}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(output, bytes);
      console.log(`Saved ${filename} (${bytes.length} bytes)`);
    }
    current = current.replaceAll(url, `/media/${filename}`).replaceAll(url.replace('base44.', 'api.'), `/media/${filename}`);
  }
  await writeFile(file, current);
}
