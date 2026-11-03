export interface Db {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export async function initSchema(db: Db): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS cards (
    id SERIAL PRIMARY KEY,
    driver_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    daily_limit_cents INTEGER NOT NULL,
    per_txn_limit_cents INTEGER NOT NULL
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    card_id INTEGER NOT NULL REFERENCES cards(id),
    amount_cents INTEGER NOT NULL,
    approved BOOLEAN NOT NULL,
    decline_reason TEXT,
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (card_id, idempotency_key)
  )`);
}
