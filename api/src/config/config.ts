import dotenv from 'dotenv';

dotenv.config();

const required = (key: string, fallback?: string): string => {
  const v = process.env[key] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env: ${key}`);
  return v;
};

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  mongoUrl: required('MONGODB_URL', 'mongodb://127.0.0.1:27017/pharma'),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3001',

  scraperUrl: process.env.SCRAPER_URL ?? 'http://localhost:8000',
  nodeCallbackBase: process.env.NODE_CALLBACK_BASE ?? 'http://localhost:3000',
  workerSecret: process.env.PHARMA_WORKER_SECRET ?? 'change-me',

  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY ?? '',

  google: {
    clientId: process.env.GCP_GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GCP_GOOGLE_CLIENT_SECRET ?? '',
    redirectUri:
      process.env.GCP_GOOGLE_REDIRECT_URI ??
      'http://localhost:3000/v1/email/auth/google/callback',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
  },
};

// The /internal ingest endpoint is only as safe as this secret. Never run prod on the default
// (including the .env.example placeholder).
const INSECURE_SECRETS = ['', 'change-me', 'change-me-to-a-long-random-string'];
const SECRET_UNSET =
  !process.env.PHARMA_WORKER_SECRET || INSECURE_SECRETS.includes(config.workerSecret);
if (SECRET_UNSET) {
  if (config.env === 'production') {
    throw new Error('PHARMA_WORKER_SECRET must be set to a non-default value in production');
  }
  // eslint-disable-next-line no-console
  console.warn('[config] PHARMA_WORKER_SECRET is the insecure default — set it in .env');
}
