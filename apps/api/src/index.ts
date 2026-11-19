import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { toNodeHandler } from "better-auth/node";
import { env } from "./env";
import { auth } from "./auth";
import { ensureIndexes } from "./collections";
import { requireAuth } from "./middleware/requireAuth";
import { uploadsRouter } from "./routes/uploads";

await ensureIndexes();

const app = express();
app.set("trust proxy", 1); // we will sit behind a reverse proxy once deployed

app.use(
  cors({
    origin: env.DASHBOARD_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  }),
);

// Must come BEFORE express.json(), or auth requests hang.
app.all("/api/auth/*splat", toNodeHandler(auth));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/me", requireAuth, (_req, res) => {
  const { id, email, name } = res.locals.user;
  res.json({ id, email, name });
});

app.use(
  "/uploads",
  rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }),
  uploadsRouter,
);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

app.listen(env.PORT, () => console.log(`API listening on :${env.PORT}`));
