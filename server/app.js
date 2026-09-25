import { mealRouter } from './meal-options.js';
import {healthRouter} from './trip-health.js';
import {ticketsRouter,publicTicketsRouter} from './affiliate-providers/router.js';
import {accountRouter} from './account.js';
import { randomUUID } from 'node:crypto';
import { adminRouter } from './admin/router.js';
import { mfaRouter } from './admin/mfa.js';
import { requestContext,recordLog } from './admin/telemetry.js';
import { runtimePolicy } from './admin/runtime.js';
import { readSettings,publicSettings } from './admin/settings.js';
import {brandingDirectory,brandFilename} from './admin/branding.js';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { config, root } from './config.js';
import { pool } from './db.js';
import { assert } from './errors.js';
import { loadUser, requireUser, authRouter } from './auth.js';
import { entityRouter } from './entities.js';
import { tripRouter, getSharedTrip } from './trips.js';
import { uploadRouter } from './uploads.js';
import { aiRouter } from './ai.js';
import { placesRouter } from './places.js';
import './place-enrichment.js';
import { walletRouter } from './wallet.js';
import {socialRouter} from './social-auth/router.js';
import {getAppUrls,allowedOrigins,urlDetails} from './app-urls.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req,res,next)=>{req.requestId=randomUUID();res.set('X-Request-ID',req.requestId);const began=Date.now();res.on('finish',()=>{if(res.statusCode>=400)void recordLog({level:res.statusCode>=500?'error':'warning',category:res.statusCode===429||res.statusCode===403||res.statusCode===401?'security':'api',event:res.statusCode===429?'rate_limit':'http_'+res.statusCode,status:res.statusCode,duration:Date.now()-began,requestId:req.requestId});});requestContext.run({requestId:req.requestId},next);});
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY' });
    next();
  });
  app.use('/api', rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many requests. Please try again shortly.' } }));
  app.use('/api', async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
        if(req.method==='POST'&&req.path==='/auth/apple/callback')return next();
        assert(req.get('X-Requested-With') === 'TripSync', 403, 'Invalid request.');
        const origin = req.get('Origin');
        const allowed = origin?allowedOrigins(await getAppUrls()):new Set();
        assert(!origin || allowed.has(origin), 403, 'Origin not allowed.');
      }
      next();
    } catch (error) { next(error); }
  });
  app.use(express.json({ limit: '1mb' }));
  app.post('/api/auth/apple/callback',express.urlencoded({extended:false,limit:'24kb',parameterLimit:8}));
  app.get('/api/application-urls',async(_req,res)=>res.json(urlDetails(await getAppUrls())));
  app.get('/brand-assets/:name',(req,res)=>{assert(brandFilename.test(req.params.name),404,'Asset not found.');res.set('X-Content-Type-Options','nosniff').sendFile(req.params.name,{root:brandingDirectory,dotfiles:'deny'});});
  app.get('/api/health', async (_req, res) => {
    try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'mysql' }); }
    catch { res.status(503).json({ ok: false, error: 'MySQL is unavailable. Start the database and check .env.' }); }
  });
  app.get('/api/config',runtimePolicy, (_req, res) => {const all=requestContext.getStore().settings;res.json({ ai: Boolean(config.aiKey && config.aiModel && all.settings.ai_enabled), imageGeneration: Boolean(config.aiKey && config.imageModel && all.settings.ai_enabled), places: Boolean(config.googleMapsKey && all.settings.google_enabled && all.features.google_autocomplete),features:all.features });});
  app.get('/api/public-settings',async(_req,res)=>res.json(publicSettings(await readSettings())));
  app.get('/api/shared/:token',async(req,res,next)=>{assert(/^[A-Za-z0-9_-]{24,128}$/.test(req.params.token),404,'Shared trip not found.');const all=await readSettings();assert(all.features.public_sharing&&!all.settings.maintenance_enabled,503,'Public sharing is currently unavailable.');next();},getSharedTrip);
  app.use('/api', loadUser);
  app.use('/api/shared',publicTicketsRouter);
  app.use('/api',(req,_res,next)=>{const context=requestContext.getStore();if(context)context.userId=req.user?.id||null;next();});
  app.use('/api',runtimePolicy);
  app.use('/api',socialRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/account',requireUser,accountRouter);
  app.use('/api/admin/mfa', mfaRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/entities', requireUser, entityRouter);
  app.use('/api/trips', requireUser, mealRouter);
  app.use('/api/trips', requireUser, healthRouter);
  app.use('/api/trips', requireUser, ticketsRouter);
  app.use('/api/trips', requireUser, tripRouter);
  app.use('/api/trips/:tripId/wallet', requireUser, walletRouter);
  app.use('/api/uploads', requireUser, uploadRouter);
  app.use('/api/ai', requireUser, aiRouter);
  app.use('/api/places', requireUser, placesRouter);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  const dist = path.join(root, 'dist');
  if (existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use((error, _req, res, _next) => {
    const unavailable = ['ECONNREFUSED','ER_ACCESS_DENIED_ERROR','ER_BAD_DB_ERROR','ER_NO_SUCH_TABLE'].includes(error.code);
    const status = error.status || (error.code === 'LIMIT_FILE_SIZE' ? 413 : unavailable ? 503 : 500);
    if (status >= 500) console.error('API error:', error.code || error.message);
    res.status(status).json({ error: status < 500 ? error.message : unavailable ? 'The database is not ready. Start MySQL and run npm run db:migrate.' : status === 502 || status === 503 ? error.message : 'The request could not be completed.' });
  });
  return app;
}
