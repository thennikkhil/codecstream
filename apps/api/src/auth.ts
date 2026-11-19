import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { db } from './db';
import { env } from './env';

export const auth = betterAuth({
  database: mongodbAdapter(db),
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.DASHBOARD_ORIGIN],
  emailAndPassword: { enabled: true },
});
