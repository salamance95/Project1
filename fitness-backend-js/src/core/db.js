/**
 * better-sqlite3 + Drizzle 연결.
 * 파이썬 백엔드와 같은 파일을 가리켜서 두 서버의 응답을 그대로 비교할 수 있게 한다.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "../db/schema.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..", "..");

// 파이썬 쪽 기본 경로(fitness-backend/data/fitness.db)를 그대로 쓴다.
const DEFAULT_DB = path.resolve(
  projectRoot,
  "..",
  "fitness-backend",
  "data",
  "fitness.db",
);

export const databasePath = process.env.FITNESS_DATABASE_PATH ?? DEFAULT_DB;

export const sqlite = new Database(databasePath);

// SQLite는 외래키 제약이 기본 비활성이다. 파이썬 쪽과 동일하게 켠다.
sqlite.pragma("foreign_keys = ON");

/** 이전 버전 DB에 없는 컬럼만 붙인다. 있으면 그대로 둔다. */
function addMissingColumn(table, column, definition) {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.length === 0) return;
  if (columns.some((item) => item.name === column)) return;
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

addMissingColumn("profiles", "split", "VARCHAR(20)");
addMissingColumn("users", "body_fat_pct", "FLOAT");
addMissingColumn("users", "muscle_mass_kg", "FLOAT");
addMissingColumn("set_logs", "distance_km", "FLOAT NOT NULL DEFAULT 0");
// 소셜 로그인. 한 계정이 두 사용자 행에 붙지 않도록 유일 인덱스를 건다.
addMissingColumn("users", "supabase_user_id", "VARCHAR(64)");
addMissingColumn("users", "email", "VARCHAR(255)");
sqlite.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_users_supabase_user_id " +
    "ON users (supabase_user_id) WHERE supabase_user_id IS NOT NULL",
);

// 나중에 생긴 테이블. 파이썬 쪽 create_all과 같은 모양으로 만든다.
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS music_links (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    label VARCHAR(60) NOT NULL,
    url VARCHAR(500) NOT NULL,
    created_at DATETIME,
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
  )
`);

export const db = drizzle(sqlite, { schema });
export { schema };
