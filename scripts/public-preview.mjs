// Local review only: never starts against the ordinary application database.
import assert from 'node:assert/strict';
assert(/_test$/.test(process.env.MYSQL_TEST_DATABASE||''),'Set MYSQL_TEST_DATABASE to a separate database ending in _test.');
process.env.MYSQL_DATABASE=process.env.MYSQL_TEST_DATABASE;
process.env.NODE_ENV='test';
process.env.SMTP_HOST='';
const {migrate}=await import('../server/migrate.js'),{pool}=await import('../server/db.js'),{createApp}=await import('../server/app.js');
const {seedPublicItineraries}=await import('../server/public-itineraries/service.js');
await migrate();const rows=await seedPublicItineraries();
const port=Number(process.env.PUBLIC_PREVIEW_PORT||3005);
process.env.PUBLIC_APP_URL=`http://127.0.0.1:${port}`;
const server=createApp().listen(port,'127.0.0.1',()=>console.log(`${rows.length} editorial itineraries ready at http://127.0.0.1:${port}/trips/rome/4-day-itinerary`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await pool.end();process.exit();}));
