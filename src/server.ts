import { Pool } from 'pg';
import { createApp } from './app';
import { initSchema } from './db';

// Secrets come from the environment, never from the code.
const jwtSecret = process.env.JWT_SECRET;
const databaseUrl = process.env.DATABASE_URL;
if (!jwtSecret || !databaseUrl) {
  console.error('JWT_SECRET and DATABASE_URL must be set (see README).');
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });
initSchema(pool).then(() => {
  const port = Number(process.env.PORT ?? 3000);
  createApp({ db: pool, jwtSecret }).listen(port, () => console.log(`Listening on ${port}`));
});
