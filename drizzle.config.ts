import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/memory/schema.ts',
  out: './src/memory/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
