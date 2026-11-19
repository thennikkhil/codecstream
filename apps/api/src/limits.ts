import { env } from "./env";

const MB = 1024 * 1024;
const GB = 1024 * MB;

export function limitsFor(email: string) {
  const isOwner = !!env.OWNER_EMAIL && email.toLowerCase() === env.OWNER_EMAIL.toLowerCase();
  return isOwner
    ? { maxBytes: 10 * GB, maxPerDay: 20, maxActive: 3 }
    : { maxBytes: 50 * MB, maxPerDay: 3, maxActive: 1 };
}
