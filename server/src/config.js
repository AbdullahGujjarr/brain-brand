import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '../../.env') });

export const config = {
  port: Number(process.env.PORT) || 3000,
  isProd: process.env.NODE_ENV === 'production',
  mongoUri: process.env.MONGODB_URI,
  mongoDb: process.env.MONGODB_DB || 'brainbrand',
  jwtSecret: process.env.JWT_SECRET,
  geminiKey: process.env.GEMINI_API_KEY,
  geminiModels: (process.env.GEMINI_MODELS || 'gemini-3-flash-preview,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean),
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  clientDist: path.join(here, '../../client/dist'),
};

for (const key of ['mongoUri', 'jwtSecret']) {
  if (!config[key]) throw new Error(`Missing required setting: ${key}. Check your .env file.`);
}
