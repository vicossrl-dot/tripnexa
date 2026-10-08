import { pool } from '../server/db.js';
import { seedPublicItineraries, drainPublicItineraryJobs, canonicalFor } from '../server/public-itineraries/service.js';
const command=process.argv[2];
try {
  if(command==='seed') {
    const rows=await seedPublicItineraries();
    console.log(JSON.stringify({count:rows.length,itineraries:rows.map(row=>({url:canonicalFor(row),status:row.status,indexable:!!row.indexable}))},null,2));
  } else if(command==='refresh') console.log(JSON.stringify({processed:await drainPublicItineraryJobs(100)}));
  else throw new Error('Usage: node scripts/public-itineraries.mjs seed|refresh. Run the normal database migration first.');
} finally { await pool.end(); }
