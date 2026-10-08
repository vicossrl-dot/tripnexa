export async function migratePublicItineraries(db) {
  for (const [table, field, definition] of [
    ['trips','share_public_itinerary','BOOLEAN NULL DEFAULT NULL'],
    ['users','public_itinerary_eligible','BOOLEAN NOT NULL DEFAULT FALSE'],
  ]) {
    const [columns] = await db.query(`SHOW COLUMNS FROM ${table}`);
    if (!columns.some(column => column.Field === field)) await db.query(`ALTER TABLE ${table} ADD COLUMN ${field} ${definition}`);
  }
  await db.query(`CREATE TABLE IF NOT EXISTS public_itineraries (
    public_id CHAR(36) PRIMARY KEY, source_trip_id VARCHAR(64) NULL UNIQUE,
    seed_key VARCHAR(100) NULL UNIQUE, city_key VARCHAR(80) NOT NULL, city VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL, duration_days SMALLINT NOT NULL, persona VARCHAR(40) NOT NULL,
    intent VARCHAR(40) NOT NULL, slug VARCHAR(180) NOT NULL, title VARCHAR(220) NOT NULL,
    description VARCHAR(320) NOT NULL, h1 VARCHAR(200) NOT NULL, introduction TEXT NOT NULL,
    snapshot JSON NOT NULL, content_hash CHAR(64) NOT NULL, quality_score SMALLINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft', indexable BOOLEAN NOT NULL DEFAULT FALSE,
    admin_hidden BOOLEAN NOT NULL DEFAULT FALSE, forced_noindex BOOLEAN NOT NULL DEFAULT FALSE,
    eligibility_reason VARCHAR(60) NOT NULL, duplicate_of CHAR(36) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    published_at DATETIME(3) NULL, UNIQUE KEY public_route(city_key,slug),
    INDEX public_catalog(status,indexable,city_key,duration_days), INDEX public_sitemap(status,indexable,public_id),
    FOREIGN KEY(source_trip_id) REFERENCES trips(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS public_itinerary_jobs (
    trip_id VARCHAR(64) PRIMARY KEY, attempts SMALLINT NOT NULL DEFAULT 0,
    reason VARCHAR(60) NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS public_itinerary_copies (
    owner_id VARCHAR(64) NOT NULL, public_id CHAR(36) NOT NULL, trip_id VARCHAR(64) NOT NULL UNIQUE,
    template JSON NOT NULL, place_map JSON NOT NULL, materialized BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY(owner_id,public_id), FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await db.query('CREATE TABLE IF NOT EXISTS public_itinerary_publication_lock (id INT PRIMARY KEY) ENGINE=InnoDB');
  await db.query('INSERT IGNORE INTO public_itinerary_publication_lock(id) VALUES(1)');
}
