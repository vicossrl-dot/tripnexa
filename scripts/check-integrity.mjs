// Read-only integrity report. Never repairs or deletes records or physical files.
import {writeFile,mkdir,lstat} from 'node:fs/promises';
import {pool} from '../server/db.js';
import {uploadPath} from '../server/admin/storage.js';
const checks={
 orphanTripItems:'SELECT COUNT(*) AS total FROM trip_items i LEFT JOIN trips t ON t.id=i.trip_id AND t.owner_id=i.owner_id WHERE t.id IS NULL',
 orphanItineraryItems:'SELECT COUNT(*) AS total FROM itinerary_items i LEFT JOIN trips t ON t.id=i.trip_id AND t.owner_id=i.owner_id WHERE t.id IS NULL',
 invalidTripOwners:'SELECT COUNT(*) AS total FROM trips t LEFT JOIN users u ON u.id=t.owner_id WHERE u.id IS NULL',
 orphanAttachmentReferences:'SELECT COUNT(*) AS total FROM item_attachments a LEFT JOIN uploads f ON f.id=a.upload_id AND f.owner_id=a.owner_id LEFT JOIN trip_items i ON i.id=a.item_id AND i.owner_id=a.owner_id WHERE f.id IS NULL OR i.id IS NULL',
 enabledSharesWithoutToken:"SELECT COUNT(*) AS total FROM trips WHERE share_enabled=TRUE AND (share_token IS NULL OR share_token='')",
 itineraryVersionsAheadOfTrip:'SELECT COUNT(*) AS total FROM itinerary_items i JOIN trips t ON t.id=i.trip_id WHERE i.version>COALESCE(t.plan_version,0)',
 duplicateScheduledSelections:"SELECT COUNT(*) AS total FROM (SELECT trip_id,selection_id FROM itinerary_items WHERE step_type='visit' AND selection_id IS NOT NULL GROUP BY trip_id,selection_id HAVING COUNT(*)>1) duplicates",
 invalidDurations:'SELECT COUNT(*) AS total FROM itinerary_items WHERE duration_min<=0',
};
const report={at:new Date().toISOString(),mode:'read-only',checks:{}};
try{
 for(const [name,sql]of Object.entries(checks)){const [[row]]=await pool.query(sql);report.checks[name]=Number(row.total);}
 const [files]=await pool.query('SELECT filename FROM uploads');let missing=0,invalid=0;
 for(const file of files){try{const stat=await lstat(uploadPath(file.filename));if(!stat.isFile()||stat.isSymbolicLink())invalid++;}catch(e){if(e.code==='ENOENT')missing++;else invalid++;}}
 report.checks.missingPhysicalUploads=missing;report.checks.invalidPhysicalReferences=invalid;report.uploadsChecked=files.length;
 await mkdir('.local/final-verification',{recursive:true});await writeFile('.local/final-verification/integrity.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await pool.end();}
