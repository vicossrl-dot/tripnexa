import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestContext } from './request-context.js';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });
export const config = {
  production: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || '127.0.0.1',
  appUrl: process.env.PUBLIC_APP_URL || process.env.APP_URL || (process.env.NODE_ENV==='production'?'':'http://127.0.0.1:5173'),
  database: {
    ...(process.env.MYSQL_SOCKET
      ? { socketPath: process.env.MYSQL_SOCKET }
      : {
          host: process.env.MYSQL_HOST || '127.0.0.1',
          port: Number(process.env.MYSQL_PORT || 3306),
        }),
    user: process.env.MYSQL_USER || 'tripsync',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'tripsync',
    connectionLimit: 10, timezone: 'Z', dateStrings: true,
    decimalNumbers: true, charset: 'utf8mb4',
  },
  uploads: path.resolve(root, process.env.UPLOAD_DIR || '.local/uploads'),
  outbox: path.resolve(root, process.env.MAIL_OUTBOX || '.local/mail'),
  aiKey: process.env.OPENAI_API_KEY || '',
  aiModel: process.env.OPENAI_MODEL || '',
  imageModel: process.env.OPENAI_IMAGE_MODEL || '',
  googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || '',
  referralFile: path.resolve(root, process.env.REFERRAL_LINKS_FILE || '.local/referrals.json'),
};
// Request-local provider overrides never mutate configuration shared by concurrent users.
for(const [property,secret,setting]of [['aiKey','OPENAI_API_KEY',null],['googleMapsKey','GOOGLE_MAPS_API_KEY',null],['aiModel',null,'text_model'],['imageModel',null,'image_model']]){
 let fallback=config[property];
 Object.defineProperty(config,property,{enumerable:true,get(){const current=requestContext.getStore();if(secret&&Object.hasOwn(current?.credentials||{},secret))return current.credentials[secret];return setting&&current?.settings?.settings?.[setting]||fallback;},set(value){fallback=value;}});
}
