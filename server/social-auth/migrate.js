export async function migrateSocial(db){
 await db.query(`CREATE TABLE IF NOT EXISTS oauth_callback_baselines (
  provider VARCHAR(16) PRIMARY KEY, callback_url VARCHAR(600) NOT NULL
 ) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS application_urls (
  id TINYINT PRIMARY KEY, public_site_url VARCHAR(500) NULL, application_url VARCHAR(500) NULL,
  version INT NOT NULL DEFAULT 1, updated_by VARCHAR(64) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
 ) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS social_providers (
  provider VARCHAR(16) PRIMARY KEY, config JSON NOT NULL, version INT NOT NULL DEFAULT 1,
  last_test JSON NULL, tested_at DATETIME(3) NULL, updated_by VARCHAR(64) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
 ) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS user_identities (
  id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, provider VARCHAR(16) NOT NULL,
  provider_subject VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  provider_email VARCHAR(254) NULL, provider_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  display_name VARCHAR(200) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  last_login_at DATETIME(3) NULL, UNIQUE KEY identity_subject(provider,provider_subject), UNIQUE KEY user_provider(user_id,provider),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
 ) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS oauth_flows (
  state_hash CHAR(64) PRIMARY KEY, binding_hash CHAR(64) NOT NULL, provider VARCHAR(16) NOT NULL,
  nonce VARCHAR(100) NOT NULL, verifier VARCHAR(100) NULL, callback_url VARCHAR(600) NOT NULL,
  fingerprint CHAR(64) NOT NULL, intent VARCHAR(16) NOT NULL, user_id VARCHAR(64) NULL, session_id VARCHAR(64) NULL,
  return_to VARCHAR(2000) NOT NULL, expires_at DATETIME(3) NOT NULL, INDEX flow_expiry(expires_at)
 ) ENGINE=InnoDB`);
 await db.query(`CREATE TABLE IF NOT EXISTS oauth_pending_links (
  token_hash CHAR(64) PRIMARY KEY, binding_hash CHAR(64) NOT NULL, provider VARCHAR(16) NOT NULL,
  identity_data JSON NOT NULL, user_id VARCHAR(64) NOT NULL, return_to VARCHAR(2000) NOT NULL,
  fingerprint CHAR(64) NOT NULL, expires_at DATETIME(3) NOT NULL, attempts INT NOT NULL DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, INDEX link_expiry(expires_at)
 ) ENGINE=InnoDB`);
 await db.query("INSERT IGNORE INTO admin_locks(name)VALUES('social_identities')");
}
