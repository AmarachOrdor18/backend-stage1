const Database = require("better-sqlite3");

const db = new Database("profiles.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    gender TEXT,
    gender_probability REAL,
    sample_size INTEGER,
    age INTEGER,
    age_group TEXT,
    country_id TEXT,
    country_name TEXT,
    country_probability REAL,
    created_at TEXT NOT NULL
  )
`);

// Add country_name column if upgrading from Stage 1
try {
  db.exec(`ALTER TABLE profiles ADD COLUMN country_name TEXT`);
} catch (e) {
  // Column already exists, ignore
}

module.exports = db;