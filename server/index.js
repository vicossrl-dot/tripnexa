import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { cleanupWalletFiles } from './file-lifecycle.js';
import {getAppUrls} from './app-urls.js';
if (config.production) {
 const urls=await getAppUrls();
 if(!process.env.SMTP_HOST||!urls.application.value||!urls.site.value)throw new Error('Production requires SMTP_HOST and valid HTTPS public site and application URLs.');
}
const app = createApp();
const server = app.listen(config.port, config.host, () => console.log(`TripSync API: http://${config.host}:${config.port}`));
const cleanup = setInterval(() => {
  pool.query('DELETE FROM sessions WHERE expires_at<UTC_TIMESTAMP()').catch(() => {});
  pool.query('DELETE FROM auth_tokens WHERE expires_at<UTC_TIMESTAMP()').catch(() => {});
  pool.query('DELETE FROM oauth_flows WHERE expires_at<UTC_TIMESTAMP()').catch(() => {});
  pool.query('DELETE FROM oauth_pending_links WHERE expires_at<UTC_TIMESTAMP()').catch(() => {});
  cleanupWalletFiles().catch(error => console.error('Wallet cleanup retry:', error.code || error.name));
}, 3600000);
cleanup.unref();
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => {
  clearInterval(cleanup);
  server.close(async () => { await pool.end(); process.exit(0); });
});
