// Pure business rules: no database, no HTTP. Easy to unit test.
export interface Card {
  id: number;
  status: 'ACTIVE' | 'BLOCKED';
  dailyLimitCents: number;
  perTxnLimitCents: number;
}

export type DeclineReason = 'CARD_BLOCKED' | 'INVALID_AMOUNT' | 'PER_TRANSACTION_LIMIT' | 'DAILY_LIMIT';
export type Decision = { approved: true } | { approved: false; reason: DeclineReason };

export function decide(card: Card, amountCents: number, spentTodayCents: number): Decision {
  if (card.status !== 'ACTIVE') return { approved: false, reason: 'CARD_BLOCKED' };
  if (!Number.isInteger(amountCents) || amountCents <= 0) return { approved: false, reason: 'INVALID_AMOUNT' };
  if (amountCents > card.perTxnLimitCents) return { approved: false, reason: 'PER_TRANSACTION_LIMIT' };
  if (spentTodayCents + amountCents > card.dailyLimitCents) return { approved: false, reason: 'DAILY_LIMIT' };
  return { approved: true };
}

// Start of the current UTC day, used to total up "spent today".
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
