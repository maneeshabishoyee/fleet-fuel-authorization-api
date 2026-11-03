# Fleet Fuel Authorization API

A small backend that decides whether a driver's fuel card purchase is approved. Fleet managers issue cards with spending limits; drivers ask for authorizations at the pump; every decision is stored.

Built with **Node.js, Express, TypeScript and PostgreSQL**, with JWT login, role-based access control, unit and API tests (Jest), Docker and a GitHub Actions pipeline.

## What it does
- **Register / log in** as a `DRIVER` or `FLEET_MANAGER` (passwords hashed with bcrypt, JWT tokens).
- **Fleet managers** issue cards to drivers with a per-transaction limit and a daily limit, and can block a card.
- **Drivers** request an authorization for their own card. It is declined if the card is blocked, the amount is invalid, or a limit would be passed.
- **Idempotency key**: if the same request is sent twice (a network retry), the second call returns the first result and does not charge again.
- **Access rules**: a driver can only use and view their own card; managers can view any card.

## API
| Method and path | Who | Purpose |
|---|---|---|
| `POST /auth/register` | anyone | create a user |
| `POST /auth/login` | anyone | get a JWT |
| `POST /cards` | manager | issue a card |
| `PATCH /cards/:id/block` | manager | block a card |
| `POST /authorizations` | driver | request approval for a purchase |
| `GET /cards/:id/transactions` | manager, or the card's driver | list decisions |

Amounts are integers in cents.

## Project layout
- `src/rules.ts` – the approve/decline rules as plain functions (no database or HTTP)
- `src/auth.ts` – JWT and role checks
- `src/app.ts` – routes
- `src/db.ts` – table definitions
- `tests/` – unit tests for the rules, API tests that run against an in-memory PostgreSQL (`pg-mem`)

## Run the tests
```bash
npm install
npm test
```

## Run it with Docker
Secrets are read from the environment and are never stored in the code.
```bash
export POSTGRES_PASSWORD='choose-something'
export JWT_SECRET='a-long-random-string'
docker compose up --build
```
The API is then on http://localhost:3000.

## Try it
```bash
curl -X POST localhost:3000/auth/register -H 'content-type: application/json' \
  -d '{"name":"Asha","email":"asha@example.com","password":"password123","role":"FLEET_MANAGER"}'
```

## Design notes
- Business rules live in one pure function, so they are easy to test and change.
- The unique `(card_id, idempotency_key)` pair in the database backs up the idempotency check.
- Possible next steps: publish approved transactions to Kafka, add pagination, add a React dashboard.
