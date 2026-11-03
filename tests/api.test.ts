import request from 'supertest';
import { newDb } from 'pg-mem';
import { createApp } from '../src/app';
import { initSchema } from '../src/db';

async function setup() {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const db = new Pool();
  await initSchema(db);
  return request(createApp({ db, jwtSecret: 'test-secret-only-for-tests' }));
}

async function signUp(api: ReturnType<typeof request>, role: string, email: string) {
  const reg = await api.post('/auth/register').send({ name: email, email, password: 'password123', role });
  const login = await api.post('/auth/login').send({ email, password: 'password123' });
  return { id: reg.body.id as number, token: login.body.token as string };
}

describe('fleet fuel authorization API', () => {
  it('rejects requests without a token', async () => {
    const api = await setup();
    expect((await api.post('/cards').send({})).status).toBe(401);
  });

  it('lets only fleet managers issue cards', async () => {
    const api = await setup();
    const driver = await signUp(api, 'DRIVER', 'd@example.com');
    const res = await api.post('/cards').set('Authorization', `Bearer ${driver.token}`)
      .send({ driverId: driver.id, dailyLimitCents: 20000, perTxnLimitCents: 10000 });
    expect(res.status).toBe(403);
  });

  it('approves, then declines once the daily limit is reached', async () => {
    const api = await setup();
    const mgr = await signUp(api, 'FLEET_MANAGER', 'm@example.com');
    const driver = await signUp(api, 'DRIVER', 'd@example.com');
    const card = await api.post('/cards').set('Authorization', `Bearer ${mgr.token}`)
      .send({ driverId: driver.id, dailyLimitCents: 15000, perTxnLimitCents: 10000 });
    const pay = (key: string, amountCents: number) => api.post('/authorizations')
      .set('Authorization', `Bearer ${driver.token}`).send({ cardId: card.body.id, amountCents, idempotencyKey: key });

    const first = await pay('a1', 10000);
    expect(first.status).toBe(201);
    expect(first.body.approved).toBe(true);

    const second = await pay('a2', 6000);
    expect(second.body.approved).toBe(false);
    expect(second.body.declineReason).toBe('DAILY_LIMIT');
  });

  it('does not charge twice when the same request is retried', async () => {
    const api = await setup();
    const mgr = await signUp(api, 'FLEET_MANAGER', 'm@example.com');
    const driver = await signUp(api, 'DRIVER', 'd@example.com');
    const card = await api.post('/cards').set('Authorization', `Bearer ${mgr.token}`)
      .send({ driverId: driver.id, dailyLimitCents: 20000, perTxnLimitCents: 10000 });
    const send = () => api.post('/authorizations').set('Authorization', `Bearer ${driver.token}`)
      .send({ cardId: card.body.id, amountCents: 9000, idempotencyKey: 'same-key' });

    const a = await send();
    const b = await send();
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);

    const list = await api.get(`/cards/${card.body.id}/transactions`).set('Authorization', `Bearer ${mgr.token}`);
    expect(list.body).toHaveLength(1);
  });

  it('declines a blocked card', async () => {
    const api = await setup();
    const mgr = await signUp(api, 'FLEET_MANAGER', 'm@example.com');
    const driver = await signUp(api, 'DRIVER', 'd@example.com');
    const card = await api.post('/cards').set('Authorization', `Bearer ${mgr.token}`)
      .send({ driverId: driver.id, dailyLimitCents: 20000, perTxnLimitCents: 10000 });
    await api.patch(`/cards/${card.body.id}/block`).set('Authorization', `Bearer ${mgr.token}`);
    const res = await api.post('/authorizations').set('Authorization', `Bearer ${driver.token}`)
      .send({ cardId: card.body.id, amountCents: 1000, idempotencyKey: 'k1' });
    expect(res.body.approved).toBe(false);
    expect(res.body.declineReason).toBe('CARD_BLOCKED');
  });

  it('keeps one driver away from another driver\'s card', async () => {
    const api = await setup();
    const mgr = await signUp(api, 'FLEET_MANAGER', 'm@example.com');
    const d1 = await signUp(api, 'DRIVER', 'd1@example.com');
    const d2 = await signUp(api, 'DRIVER', 'd2@example.com');
    const card = await api.post('/cards').set('Authorization', `Bearer ${mgr.token}`)
      .send({ driverId: d1.id, dailyLimitCents: 20000, perTxnLimitCents: 10000 });
    const peek = await api.get(`/cards/${card.body.id}/transactions`).set('Authorization', `Bearer ${d2.token}`);
    expect(peek.status).toBe(403);
    const pay = await api.post('/authorizations').set('Authorization', `Bearer ${d2.token}`)
      .send({ cardId: card.body.id, amountCents: 1000, idempotencyKey: 'x' });
    expect(pay.status).toBe(404);
  });
});
