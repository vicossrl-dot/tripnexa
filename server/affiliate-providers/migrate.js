export async function migrateAffiliates(db){
 await db.query(`CREATE TABLE IF NOT EXISTS affiliate_providers (
  provider VARCHAR(30) PRIMARY KEY, config JSON NOT NULL, version INT NOT NULL DEFAULT 1,
  last_check JSON NULL, checked_at DATETIME(3) NULL, updated_by VARCHAR(64) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
 ) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS affiliate_place_mappings (
  id VARCHAR(64) PRIMARY KEY, provider VARCHAR(30) NOT NULL, google_place_id VARCHAR(255) NOT NULL,
  canonical_place_name VARCHAR(200) NOT NULL, city VARCHAR(200) NOT NULL, country VARCHAR(100) NOT NULL,
  provider_product_id VARCHAR(200) NULL, provider_destination_id VARCHAR(200) NULL, affiliate_url VARCHAR(3000) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE, priority INT NOT NULL DEFAULT 0, version INT NOT NULL DEFAULT 1,
  created_by VARCHAR(64) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX match_place(provider,google_place_id)
 ) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS affiliate_place_overrides (
  google_place_id VARCHAR(255) PRIMARY KEY, mode VARCHAR(10) NOT NULL DEFAULT 'AUTO', version INT NOT NULL DEFAULT 1
 ) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS affiliate_wallet_links (
  trip_id VARCHAR(64) NOT NULL, owner_id VARCHAR(64) NOT NULL, selection_id VARCHAR(64) NOT NULL,
  item_id VARCHAR(64) NULL, declared_booked BOOLEAN NOT NULL DEFAULT FALSE, provider VARCHAR(30) NULL,
  PRIMARY KEY(trip_id,selection_id),
  FOREIGN KEY(trip_id,owner_id) REFERENCES trips(id,owner_id) ON DELETE CASCADE,
  FOREIGN KEY(selection_id,owner_id) REFERENCES place_selections(id,owner_id) ON DELETE CASCADE,
  FOREIGN KEY(item_id,owner_id) REFERENCES trip_items(id,owner_id) ON DELETE CASCADE
 ) ENGINE=InnoDB`);
 // analytics_events currently has no metadata. A narrow event table avoids storing private request bodies.
 await db.query(`CREATE TABLE IF NOT EXISTS affiliate_click_events (
  id VARCHAR(64) PRIMARY KEY, event VARCHAR(40) NOT NULL DEFAULT 'affiliate_ticket_click', provider VARCHAR(30) NOT NULL,
  trip_id VARCHAR(64) NULL, selection_id VARCHAR(64) NULL, google_place_id VARCHAR(255) NULL,
  city VARCHAR(200) NULL, attraction VARCHAR(200) NOT NULL, mapping_type VARCHAR(30) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX click_time(created_at),
  FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE SET NULL
 ) ENGINE=InnoDB`);
}
