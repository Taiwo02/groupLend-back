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
  ninApiUrl: process.env.NIN_API_URL ?? "",
  ninApiKey: process.env.NIN_API_KEY ?? "",
  // Email – Zeptomail (Zoho) only; set ZOHO_URL and ZOHO_TOKEN to enable
  zohoUrl: process.env.ZOHO_URL ?? "",
  zohoToken: process.env.ZOHO_TOKEN ?? "",
  mailFrom: process.env.MAIL_FROM ?? "info@enlace.ng",
  mailFromName: process.env.MAIL_FROM_NAME ?? "noreply",
  appName: process.env.APP_NAME ?? "Enlace Group Loan",
  /** Comma-separated allowed origins for CORS (e.g. https://app.example.com). If unset, allows any origin (*). */
  corsOrigin: process.env.CORS_ORIGIN
};

if (!env.databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

if (!env.jwtSecret) {
  throw new Error("JWT_SECRET is required");
}
