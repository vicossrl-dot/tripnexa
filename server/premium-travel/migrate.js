export async function migratePremiumTravel(db){
 await db.query(`CREATE TABLE IF NOT EXISTS trip_essentials_snapshots (
  trip_id VARCHAR(64) NOT NULL, owner_id VARCHAR(64) NOT NULL, context_hash CHAR(64) NOT NULL,
  passport_country CHAR(2) NULL, snapshot JSON NOT NULL, checked_at DATETIME(3) NOT NULL,
  PRIMARY KEY (trip_id,owner_id,context_hash),
  FOREIGN KEY (trip_id,owner_id) REFERENCES trips(id,owner_id) ON DELETE CASCADE
 ) ENGINE=InnoDB`);
}
