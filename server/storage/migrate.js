export async function migrateStorage(db) {
  const [columns]=await db.query('SHOW COLUMNS FROM uploads');
  const existing=new Set(columns.map(column=>column.Field));
  for(const [name,type] of Object.entries({storage_provider:"VARCHAR(16) NOT NULL DEFAULT 'local'",storage_key:'VARCHAR(700) NULL',storage_zone:'VARCHAR(100) NULL',storage_region:'VARCHAR(10) NULL',checksum_sha256:'CHAR(64) NULL',asset_kind:"VARCHAR(20) NOT NULL DEFAULT 'upload'"})) {
    if(!existing.has(name))await db.query(`ALTER TABLE uploads ADD COLUMN ${name} ${type}`);
  }
}
