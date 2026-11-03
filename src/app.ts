import bcrypt from 'bcryptjs';
import express, { Request, Response } from 'express';
import { AuthedRequest, requireAuth, requireRole, signToken } from './auth';
import { Db } from './db';
import { Card, decide, startOfUtcDay } from './rules';

interface Config { db: Db; jwtSecret: string }

const toCard = (r: any): Card & { driverId: number } => ({
  id: r.id, driverId: r.driver_id, status: r.status,
  dailyLimitCents: r.daily_limit_cents, perTxnLimitCents: r.per_txn_limit_cents,
});
const toTxn = (r: any) => ({
  id: r.id, cardId: r.card_id, amountCents: r.amount_cents, approved: r.approved,
  declineReason: r.decline_reason, createdAt: r.created_at,
});

export function createApp({ db, jwtSecret }: Config) {
  const app = express();
  app.use(express.json());
  const auth = requireAuth(jwtSecret);

  app.post('/auth/register', async (req: Request, res: Response) => {
    const { name, email, password, role } = req.body ?? {};
    if (!name || !email || typeof password !== 'string' || password.length < 8 || !['DRIVER', 'FLEET_MANAGER'].includes(role)) {
      return res.status(400).json({ error: 'name, email, role and a password of 8+ characters are required' });
    }
    const exists = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const r = await db.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, email, hash, role]);
    res.status(201).json(r.rows[0]);
  });

  app.post('/auth/login', async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};
    const r = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = r.rows[0];
    if (!user || !(await bcrypt.compare(String(password ?? ''), user.password_hash))) {
      return res.status(401).json({ error: 'Wrong email or password' });
    }
    res.json({ token: signToken({ id: user.id, role: user.role }, jwtSecret) });
  });

  // Fleet managers issue cards to drivers.
  app.post('/cards', auth, requireRole('FLEET_MANAGER'), async (req: Request, res: Response) => {
    const { driverId, dailyLimitCents, perTxnLimitCents } = req.body ?? {};
    if (![driverId, dailyLimitCents, perTxnLimitCents].every(Number.isInteger) || perTxnLimitCents > dailyLimitCents) {
      return res.status(400).json({ error: 'driverId, dailyLimitCents and perTxnLimitCents are required; per-transaction limit cannot exceed daily limit' });
    }
    const driver = await db.query('SELECT id FROM users WHERE id = $1 AND role = $2', [driverId, 'DRIVER']);
    if (!driver.rows.length) return res.status(404).json({ error: 'Driver not found' });
    const r = await db.query(
      'INSERT INTO cards (driver_id, daily_limit_cents, per_txn_limit_cents) VALUES ($1, $2, $3) RETURNING *',
      [driverId, dailyLimitCents, perTxnLimitCents]);
    res.status(201).json(toCard(r.rows[0]));
  });

  app.patch('/cards/:id/block', auth, requireRole('FLEET_MANAGER'), async (req: Request, res: Response) => {
    const r = await db.query("UPDATE cards SET status = 'BLOCKED' WHERE id = $1 RETURNING *", [Number(req.params.id)]);
    if (!r.rows.length) return res.status(404).json({ error: 'Card not found' });
    res.json(toCard(r.rows[0]));
  });

  // A driver asks to pay at the pump. The idempotency key makes retries safe.
  app.post('/authorizations', auth, requireRole('DRIVER'), async (req: AuthedRequest, res: Response) => {
    const { cardId, amountCents, idempotencyKey } = req.body ?? {};
    if (!Number.isInteger(cardId) || typeof idempotencyKey !== 'string' || !idempotencyKey) {
      return res.status(400).json({ error: 'cardId and idempotencyKey are required' });
    }
    const c = await db.query('SELECT * FROM cards WHERE id = $1', [cardId]);
    if (!c.rows.length || c.rows[0].driver_id !== req.user!.id) return res.status(404).json({ error: 'Card not found' });

    const prior = await db.query('SELECT * FROM transactions WHERE card_id = $1 AND idempotency_key = $2', [cardId, idempotencyKey]);
    if (prior.rows.length) return res.status(200).json(toTxn(prior.rows[0]));

    const since = startOfUtcDay(new Date()).toISOString();
    const spent = await db.query(
      'SELECT COALESCE(SUM(amount_cents), 0) AS total FROM transactions WHERE card_id = $1 AND approved = true AND created_at >= $2',
      [cardId, since]);
    const decision = decide(toCard(c.rows[0]), amountCents, Number(spent.rows[0].total));
    const r = await db.query(
      'INSERT INTO transactions (card_id, amount_cents, approved, decline_reason, idempotency_key) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [cardId, Number.isInteger(amountCents) ? amountCents : 0, decision.approved, decision.approved ? null : decision.reason, idempotencyKey]);
    res.status(201).json(toTxn(r.rows[0]));
  });

  // Managers see any card; a driver sees only their own.
  app.get('/cards/:id/transactions', auth, async (req: AuthedRequest, res: Response) => {
    const c = await db.query('SELECT * FROM cards WHERE id = $1', [Number(req.params.id)]);
    if (!c.rows.length) return res.status(404).json({ error: 'Card not found' });
    if (req.user!.role === 'DRIVER' && c.rows[0].driver_id !== req.user!.id) {
      return res.status(403).json({ error: 'You do not have permission to do this' });
    }
    const t = await db.query('SELECT * FROM transactions WHERE card_id = $1 ORDER BY id', [Number(req.params.id)]);
    res.json(t.rows.map(toTxn));
  });

  return app;
}
