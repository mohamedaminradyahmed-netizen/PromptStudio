import express, { Express } from 'express';
import cors from 'cors';
import { authRouter } from '../../api/routes/auth.js';
import { sessionRouter } from '../../api/routes/sessions.js';
import { cacheRouter } from '../../api/routes/cache.js';
import promptRoutes from '../../api/routes/prompts.js';
import predictionRoutes from '../../api/routes/prediction.js';
import ragRoutes from '../../api/routes/rag.js';
import { errorHandler, notFoundHandler } from '../../api/middleware/errorHandler.js';
import { authMiddleware } from '../../api/middleware/auth.js';

export function createTestApp(): Express {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API Routes
  app.use('/api/auth', authRouter);
  app.use('/api/sessions', authMiddleware, sessionRouter);
  app.use('/api/cache', authMiddleware, cacheRouter);
  app.use('/api/prompts', promptRoutes);
  app.use('/api/prediction', predictionRoutes);
  app.use('/api/rag', ragRoutes);

  // 404 handler
  app.use(notFoundHandler);

  // Error handler
  app.use(errorHandler);

  return app;
}

export function generateTestToken(userId: string, email: string, name: string): string {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    {
      userId,
      email,
      name,
      color: '#3B82F6',
    },
    process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing',
    { expiresIn: '1h' }
  );
}
