import dotenv from "dotenv";
import path from "path";

// Load .env from project root so it works regardless of cwd
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
};

export const env = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  dbLogging: parseBoolean(process.env.DB_LOGGING, false),
  monoApiUrl: process.env.MONO_API_URL ?? "",
  monoId: process.env.MONO_ID ?? "",
  monoLookUpdId: process.env.MONO_ID_LOOKUP ?? "",
  // Email – Zeptomail (Zoho) only; set ZOHO_URL and ZOHO_TOKEN to enable
  zohoUrl: process.env.ZOHO_URL ?? "",
  zohoToken: process.env.ZOHO_TOKEN ?? "",
  mailFrom: process.env.MAIL_FROM ?? "info@enlace.ng",
  mailFromName: process.env.MAIL_FROM_NAME ?? "noreply",
  appName: process.env.APP_NAME ?? "Enlace Group Loan",
  /** Comma-separated allowed origins for CORS (e.g. https://app.example.com). If unset, allows any origin (*). */
  corsOrigin: process.env.CORS_ORIGIN,
  /** Frontend base URL for email links (e.g. https://app.enlace.ng). Used in welcome and other templates. */
  frontendUrl: process.env.FRONTEND_URL ?? "",
  /** Termii API token used for sending OTP SMS. */
  smsToken: process.env.SMS_TOKEN ?? "",
  /** 32-byte key (hex or UTF-8) for BVN encryption. Required if KYC step 1 (account/BVN) is used. */
  encryptionKey: process.env.ENCRYPTION_KEY ?? "",
  /** Secret for NIN lookup key (HMAC). Defaults to JWT_SECRET if not set. */
  ninLookupSecret: process.env.NIN_LOOKUP_SECRET,
  /**
   * Comma-separated admin emails. If non-empty, `/admin/*` routes require the JWT email to match one of them.
   * If empty, any authenticated user can call admin routes (legacy behaviour).
   */
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
};

if (!env.databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

if (!env.jwtSecret) {
  throw new Error("JWT_SECRET is required");
}
