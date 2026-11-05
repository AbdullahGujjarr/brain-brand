import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import storyRoutes from './routes/stories.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    helmet({
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client'],
          frameSrc: ['https://accounts.google.com/gsi/'],
          connectSrc: ["'self'", 'https://accounts.google.com/gsi/'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style', 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https://*.googleusercontent.com'],
          upgradeInsecureRequests: config.isProd ? [] : null,
        },
      },
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  app.use((req, _res, next) => {
    req.body ??= {};
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/stories', storyRoutes);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h', dotfiles: 'allow' }));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  }

  app.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (!err.expose) console.error(err);
    res.status(status).json({ error: err.expose ? err.message : 'Something went wrong. Please try again.' });
  });
  return app;
}
