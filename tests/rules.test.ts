import { Card, decide, startOfUtcDay } from '../src/rules';

const card: Card = { id: 1, status: 'ACTIVE', dailyLimitCents: 20000, perTxnLimitCents: 12000 };

describe('decide', () => {
  it('approves a normal purchase', () => {
    expect(decide(card, 5000, 0)).toEqual({ approved: true });
  });
  it('declines a blocked card', () => {
    expect(decide({ ...card, status: 'BLOCKED' }, 5000, 0)).toEqual({ approved: false, reason: 'CARD_BLOCKED' });
  });
  it('declines zero, negative and fractional amounts', () => {
    for (const a of [0, -100, 10.5]) expect(decide(card, a, 0)).toEqual({ approved: false, reason: 'INVALID_AMOUNT' });
  });
  it('declines above the per-transaction limit', () => {
    expect(decide(card, 12001, 0)).toEqual({ approved: false, reason: 'PER_TRANSACTION_LIMIT' });
  });
  it('declines when today\'s spend would pass the daily limit', () => {
    expect(decide(card, 5000, 16000)).toEqual({ approved: false, reason: 'DAILY_LIMIT' });
  });
  it('approves exactly up to the daily limit', () => {
    expect(decide(card, 4000, 16000)).toEqual({ approved: true });
  });
});

describe('startOfUtcDay', () => {
  it('drops the time part', () => {
    expect(startOfUtcDay(new Date('2026-03-05T17:45:10Z')).toISOString()).toBe('2026-03-05T00:00:00.000Z');
  });
});
