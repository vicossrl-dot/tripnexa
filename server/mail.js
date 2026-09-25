import nodemailer from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { config } from './config.js';
import { assert } from './errors.js';
import {smtpConfiguration,smtpTransport} from './admin/providers.js';
import {pool} from './db.js';
export async function sendMail(to, subject, text, template='authentication', userId=null, html=undefined) {
  const settings=await smtpConfiguration();
  if (settings.host) {
    try{await smtpTransport(settings).sendMail({from:settings.from,to,subject,text,...(html?{html}:{})});await pool.execute('INSERT INTO email_events(id,user_id,template,status)VALUES(?,?,?,?)',[randomUUID(),userId,template,'sent']);}
    catch(error){await pool.execute('INSERT INTO email_events(id,user_id,template,status,error_code)VALUES(?,?,?,?,?)',[randomUUID(),userId,template,'failed',/^[A-Z0-9_]{1,40}$/.test(error.code||'')?error.code:'SMTP_FAILURE']);throw new Error('Email delivery failed. Please retry or contact support.');}return;
  }
  assert(!config.production, 503, 'Email delivery is not configured.');
  await mkdir(config.outbox, { recursive: true });
  await writeFile(path.join(config.outbox, `${Date.now()}-${randomUUID()}.txt`), `To: ${to}\nSubject: ${subject}\n\n${text}`, { mode: 0o600 });
  console.log('Development email saved in .local/mail (not sent).');
}
