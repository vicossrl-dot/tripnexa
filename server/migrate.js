import { pathToFileURL } from 'node:url';
import { pool } from './db.js';
import { schemas, tables } from './schema.js';
import { migrateAdmin } from './admin/migrate.js';
import {migrateAffiliates} from './affiliate-providers/migrate.js';
import {migrateSocial} from './social-auth/migrate.js';

function column(key, field) {
  if (key === 'place_id' || key.endsWith('_place_id')) return `\`${key}\` VARCHAR(255) NULL`;
  if (key.endsWith('_id')) return `\`${key}\` VARCHAR(64) NULL`;
  if (key === 'share_token') return '`share_token` VARCHAR(64) NULL UNIQUE';
  const type = field.type === 'number' ? 'DOUBLE' : field.type === 'boolean' ? 'BOOLEAN' : field.format === 'date' ? 'DATE' : 'TEXT';
  return `\`${key}\` ${type} NULL`;
}
export async function migrate() {
  const common = 'id VARCHAR(64) PRIMARY KEY, created_date DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_date DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)';
  await pool.query(`CREATE TABLE IF NOT EXISTS users (${common}, email VARCHAR(254) NOT NULL UNIQUE, password_hash VARCHAR(255) NULL, email_verified BOOLEAN NOT NULL DEFAULT FALSE, ${Object.entries(schemas.User.properties).map(([k,v]) => column(k,v)).join(', ')}) ENGINE=InnoDB`);
  for (const [name, table] of Object.entries(tables)) {
    const parent = name === 'TodoItem' ? ['board_id', 'todo_boards'] : schemas[name].properties.trip_id ? ['trip_id', 'trips'] : null;
    const fields = Object.entries(schemas[name].properties).map(([k,v]) => column(k,v));
    await pool.query(`CREATE TABLE IF NOT EXISTS ${table} (${common}, owner_id VARCHAR(64) NOT NULL, ${fields.join(', ')}, UNIQUE KEY id_owner (id, owner_id), INDEX owner_created (owner_id, created_date), FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE ${parent ? `, INDEX parent_owner (${parent[0]}, owner_id), FOREIGN KEY (${parent[0]}, owner_id) REFERENCES ${parent[1]}(id, owner_id) ON DELETE CASCADE` : ''}) ENGINE=InnoDB`);
  }
  await pool.query('CREATE TABLE IF NOT EXISTS sessions (token_hash CHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, expires_at DATETIME NOT NULL, INDEX (expires_at), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB');
  await pool.query("CREATE TABLE IF NOT EXISTS auth_tokens (user_id VARCHAR(64) NOT NULL, kind VARCHAR(16) NOT NULL, token_hash CHAR(64) NOT NULL, expires_at DATETIME NOT NULL, attempts INT NOT NULL DEFAULT 0, PRIMARY KEY(user_id, kind), INDEX (token_hash), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB");
  await pool.query('CREATE TABLE IF NOT EXISTS uploads (id VARCHAR(64) PRIMARY KEY, owner_id VARCHAR(64) NOT NULL, filename VARCHAR(100) NOT NULL, mime VARCHAR(100) NOT NULL, created_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE) ENGINE=InnoDB');
  // Additive, repeatable upgrade for databases created before phase 1.
  const [existing] = await pool.query('SHOW COLUMNS FROM trips');
  const names = new Set(existing.map(row => row.Field));
  for (const key of ['food_preferences','dining_budget','dietary_notes','special_wishes', 'destination_city', 'destination_formatted_address', 'destination_place_id', 'destination_latitude', 'destination_longitude', 'travel_type']) {
    if (!names.has(key)) await pool.query(`ALTER TABLE trips ADD COLUMN ${column(key, schemas.Trip.properties[key])}`);
  }
  const [placeColumns] = await pool.query('SHOW COLUMNS FROM place_selections');
  const placeNames = new Set(placeColumns.map(row => row.Field));
  for (const key of ['city', 'country', 'lat', 'lng', 'category', 'area', 'best_time_of_day', 'selection_source']) {
    if (!placeNames.has(key)) await pool.query(`ALTER TABLE place_selections ADD COLUMN ${column(key, schemas.PlaceSelection.properties[key])}`);
  }
  // Google IDs can be longer than application record IDs. Widen only, never truncate.
  for (const [name, keys] of [['Trip', ['arrival_location', 'arrival_datetime', 'departure_location', 'departure_datetime', 'itinerary_meta']], ['ItineraryItem', ['meal_choice','selection_id', 'lat', 'lng', 'start_datetime', 'end_datetime']]]) {
    const table = tables[name];
    const [columns] = await pool.query(`SHOW COLUMNS FROM ${table}`);
    const known = new Set(columns.map(row => row.Field));
    for (const key of keys) if (!known.has(key)) await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column(key, schemas[name].properties[key])}`);
  }
  for (const table of ['place_selections', 'trip_items', 'itinerary_items']) {
    const [columns] = await pool.query(`SHOW COLUMNS FROM ${table} LIKE 'place_id'`);
    if (columns[0]?.Type.toLowerCase() === 'varchar(64)') await pool.query(`ALTER TABLE ${table} MODIFY COLUMN place_id VARCHAR(255) NULL`);
  }
  for (const [name, keys] of [['Trip', ['arrival_place_id','arrival_address','arrival_city','arrival_country','arrival_lat','arrival_lng','arrival_ticket_url','departure_place_id','departure_address','departure_city','departure_country','departure_lat','departure_lng','departure_ticket_url']], ['TripItem', ['city','country','reservation_file_url']]]) {
    const [columns] = await pool.query(`SHOW COLUMNS FROM ${tables[name]}`);
    const known = new Set(columns.map(row => row.Field));
    for (const key of keys) if (!known.has(key)) await pool.query(`ALTER TABLE ${tables[name]} ADD COLUMN ${column(key, schemas[name].properties[key])}`);
  }
  const [walletItemColumns] = await pool.query('SHOW COLUMNS FROM trip_items');
  for (const key of ['airline','traveler']) if (!walletItemColumns.some(row => row.Field === key)) await pool.query(`ALTER TABLE trip_items ADD COLUMN ${column(key, schemas.TripItem.properties[key])}`);
  const [uploadColumns] = await pool.query('SHOW COLUMNS FROM uploads');
  if (!uploadColumns.some(row => row.Field === 'wallet_managed')) await pool.query('ALTER TABLE uploads ADD COLUMN wallet_managed BOOLEAN NOT NULL DEFAULT FALSE');
  const [indexes] = await pool.query("SHOW INDEX FROM uploads WHERE Key_name='upload_owner'");
  if (!indexes.length) await pool.query('ALTER TABLE uploads ADD UNIQUE KEY upload_owner (id,owner_id)');
  await pool.query(`CREATE TABLE IF NOT EXISTS item_attachments (
    ${common}, owner_id VARCHAR(64) NOT NULL, item_id VARCHAR(64) NOT NULL, upload_id VARCHAR(64) NOT NULL,
    original_name VARCHAR(255) NOT NULL, label VARCHAR(255) NULL, traveler VARCHAR(200) NULL,
    notes TEXT NULL, document_type VARCHAR(60) NULL, expiry_date DATE NULL,
    UNIQUE KEY item_upload (item_id,upload_id), INDEX owner_item (owner_id,item_id),
    FOREIGN KEY (item_id,owner_id) REFERENCES trip_items(id,owner_id) ON DELETE CASCADE,
    FOREIGN KEY (upload_id,owner_id) REFERENCES uploads(id,owner_id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await migrateAdmin(pool);
  await migrateAffiliates(pool);
  await migrateSocial(pool);
  await pool.query(`CREATE TABLE IF NOT EXISTS itinerary_repair_history (
    id VARCHAR(64) PRIMARY KEY, trip_id VARCHAR(64) NOT NULL, owner_id VARCHAR(64) NOT NULL,
    previous_state JSON NOT NULL, after_revision CHAR(64) NOT NULL, input_hash CHAR(64) NOT NULL,
    undone BOOLEAN NOT NULL DEFAULT FALSE, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX trip_history(trip_id,owner_id,created_at),
    FOREIGN KEY(trip_id,owner_id) REFERENCES trips(id,owner_id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await migrate(); console.log('MySQL tables are ready.'); }
  catch (error) { console.error('Database setup failed:', error.code || error.message); process.exitCode = 1; }
  finally { await pool.end(); }
}
