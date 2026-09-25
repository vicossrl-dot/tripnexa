// Additive upgrades only. Existing accounts never gain privileges automatically.
export async function migrateAdmin(db) {
  async function columns(table, definitions) {
    const [existing] = await db.query(`SHOW COLUMNS FROM ${table}`);
    for (const [name, definition] of Object.entries(definitions)) {
      if (!existing.some(row => row.Field === name)) await db.query(`ALTER TABLE ${table} ADD COLUMN \`${name}\` ${definition}`);
    }
  }
  await columns('users', {
    role: "VARCHAR(20) NOT NULL DEFAULT 'USER'", status: "VARCHAR(24) NOT NULL DEFAULT 'ACTIVE'",
    suspended_at: 'DATETIME(3) NULL', suspended_by: 'VARCHAR(64) NULL', suspension_reason: 'VARCHAR(500) NULL',
  });
  await columns('sessions', {
    id: 'VARCHAR(64) NULL UNIQUE', created_at: 'DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)',
    last_seen_at: 'DATETIME(3) NULL', authenticated_at: 'DATETIME(3) NULL', mfa_verified_at: 'DATETIME(3) NULL',
    device_summary: 'VARCHAR(60) NULL',
  });
  await db.query('UPDATE sessions SET id=UUID() WHERE id IS NULL');
  await db.query(`CREATE TABLE IF NOT EXISTS admin_locks (name VARCHAR(60) PRIMARY KEY) ENGINE=InnoDB`);
  await db.query("INSERT IGNORE INTO admin_locks(name) VALUES ('privileged_accounts')");
  await db.query(`CREATE TABLE IF NOT EXISTS audit_events (
    id VARCHAR(64) PRIMARY KEY, actor_user_id VARCHAR(64) NULL, actor_role VARCHAR(20) NULL,
    action VARCHAR(100) NOT NULL, target_type VARCHAR(60) NULL, target_id VARCHAR(64) NULL,
    result VARCHAR(20) NOT NULL, reason VARCHAR(500) NULL, request_id VARCHAR(64) NULL,
    metadata_redacted JSON NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX audit_time(created_at), INDEX audit_actor(actor_user_id,created_at), INDEX audit_action(action,created_at)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS admin_mfa (
    user_id VARCHAR(64) PRIMARY KEY, encrypted_secret JSON NOT NULL, pending_secret JSON NULL,
    pending_expires_at DATETIME(3) NULL, enabled BOOLEAN NOT NULL DEFAULT FALSE,
    last_counter BIGINT NOT NULL DEFAULT -1, recovery_hashes JSON NULL, failures INT NOT NULL DEFAULT 0,
    locked_until DATETIME(3) NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await columns('uploads',{size_bytes:'BIGINT UNSIGNED NULL'});
  await db.query(`CREATE TABLE IF NOT EXISTS app_logs (
    id VARCHAR(64) PRIMARY KEY, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    level VARCHAR(12) NOT NULL, category VARCHAR(30) NOT NULL, event VARCHAR(100) NOT NULL,
    request_id VARCHAR(64) NULL, status INT NULL, duration_ms INT NULL, context_redacted JSON NULL,
    INDEX log_time(created_at), INDEX log_category(category,created_at)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS analytics_events (
    id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NULL, event VARCHAR(50) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX analytics_time(event,created_at)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS provider_events (
    id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NULL, provider VARCHAR(30) NOT NULL, operation VARCHAR(60) NOT NULL,
    success BOOLEAN NOT NULL, latency_ms INT NULL, model VARCHAR(150) NULL, input_tokens BIGINT NULL, output_tokens BIGINT NULL,
    estimated_cost DECIMAL(14,6) NULL, http_status INT NULL, request_id VARCHAR(100) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX provider_time(provider,created_at)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS email_events (
    id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NULL, template VARCHAR(60) NOT NULL,
    status VARCHAR(20) NOT NULL, error_code VARCHAR(80) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX email_time(created_at)
  ) ENGINE=InnoDB`);
  for(const table of ['app_settings','feature_flags','usage_quotas'])await db.query(`CREATE TABLE IF NOT EXISTS ${table} (
    setting_key VARCHAR(100) PRIMARY KEY, value JSON NOT NULL, version INT NOT NULL DEFAULT 1,
    updated_by VARCHAR(64) NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS settings_history (
    id VARCHAR(64) PRIMARY KEY, section VARCHAR(30) NOT NULL, setting_key VARCHAR(100) NOT NULL,
    old_value JSON NULL, new_value JSON NOT NULL, version INT NOT NULL, updated_by VARCHAR(64) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX setting_history(setting_key,created_at)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS managed_secrets (
    secret_name VARCHAR(60) PRIMARY KEY, provider VARCHAR(30) NOT NULL, encrypted_value JSON NOT NULL,
    version INT NOT NULL DEFAULT 1, updated_by VARCHAR(64) NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS usage_counters (
    scope VARCHAR(100) NOT NULL, operation VARCHAR(60) NOT NULL, bucket VARCHAR(30) NOT NULL,
    count BIGINT NOT NULL DEFAULT 0, PRIMARY KEY(scope,operation,bucket)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS file_access_grants (
    id VARCHAR(64) PRIMARY KEY, file_id VARCHAR(64) NOT NULL, requested_by VARCHAR(64) NOT NULL,
    approved_by VARCHAR(64) NULL, reason VARCHAR(500) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    expires_at DATETIME(3) NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX grants_file(file_id)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS maintenance_jobs (
    id VARCHAR(64) PRIMARY KEY, type VARCHAR(40) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    progress INT NOT NULL DEFAULT 0, started_by VARCHAR(64) NOT NULL, started_at DATETIME(3) NULL,
    finished_at DATETIME(3) NULL, result_summary JSON NULL, private_payload JSON NULL, error_sanitized VARCHAR(150) NULL,
    idempotency_key VARCHAR(64) NOT NULL UNIQUE, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS privacy_requests (
    id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, type VARCHAR(20) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    job_id VARCHAR(64) NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), completed_at DATETIME(3) NULL,
    INDEX privacy_user(user_id)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS backup_reports (
    id VARCHAR(64) PRIMARY KEY, component VARCHAR(20) NOT NULL, success BOOLEAN NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX backup_time(created_at)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS notification_reads (
    notification_key VARCHAR(150) NOT NULL, user_id VARCHAR(64) NOT NULL, read_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY(notification_key,user_id)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS referral_rules (
    id VARCHAR(64) PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT TRUE, provider VARCHAR(100) NOT NULL,
    place_id VARCHAR(255) NULL, selection_id VARCHAR(64) NULL, name_match VARCHAR(200) NULL, destination_match VARCHAR(200) NULL,
    target_url_template VARCHAR(3000) NOT NULL, allowed_host VARCHAR(253) NOT NULL, label VARCHAR(100) NOT NULL,
    priority INT NOT NULL DEFAULT 0, version INT NOT NULL DEFAULT 1, created_by VARCHAR(64) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS email_templates (
    template_key VARCHAR(60) PRIMARY KEY, subject VARCHAR(200) NOT NULL, html TEXT NOT NULL, plain_text TEXT NOT NULL,
    version INT NOT NULL DEFAULT 1, updated_by VARCHAR(64) NOT NULL, updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`);
  await db.query(`CREATE TABLE IF NOT EXISTS content_versions (
    id VARCHAR(64) PRIMARY KEY, kind VARCHAR(30) NOT NULL, target_id VARCHAR(64) NOT NULL, value JSON NOT NULL,
    version INT NOT NULL, updated_by VARCHAR(64) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`);
}
