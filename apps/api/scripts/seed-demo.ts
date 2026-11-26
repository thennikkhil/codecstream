import { auth } from "../src/auth";

const email = process.env.DEMO_EMAIL;
const password = process.env.DEMO_PASSWORD;
if (!email || !password) throw new Error("set DEMO_EMAIL (in .env) and DEMO_PASSWORD (inline)");
try {
  await auth.api.signUpEmail({ body: { email, password, name: "Demo" } });
  console.log("demo user created");
} catch (e) {
  console.log("demo user not created (may already exist):", e instanceof Error ? e.message : e);
}
process.exit(0);
