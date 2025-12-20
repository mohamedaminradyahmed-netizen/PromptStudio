import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';

import { setupWebSocket } from './websocket/index.js';
import { authRouter } from './api/routes/auth.js';
import { sessionRouter } from './api/routes/sessions.js';
import { cacheRouter } from './api/routes/cache.js';
import { translationRouter } from './api/routes/translation.js';
import promptRoutes from './api/routes/prompts.js';
import ragRoutes from './api/routes/rag.js';
import chainRoutes from './api/routes/chains.js';
import reasoningRoutes from './api/routes/reasoning.js';
import refinementRoutes from './api/routes/refinement.js';
import predictionRoutes from './api/routes/prediction.js';
import llmRoutes from './api/routes/llm.js';
import { errorHandler, notFoundHandler } from './api/middleware/errorHandler.js';
import { authMiddleware } from './api/middleware/auth.js';
import { swaggerSpec } from './api/swagger/config.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Socket.IO setup
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Swagger Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'PromptStudio API Documentation',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
  },
}));

// Swagger JSON endpoint
app.get('/api/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    docs: '/api/docs',
  });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/sessions', authMiddleware, sessionRouter);
app.use('/api/cache', authMiddleware, cacheRouter);
app.use('/api/translation', translationRouter);
app.use('/api/prompts', promptRoutes);
app.use('/api/rag', ragRoutes);
app.use('/api/chains', chainRoutes);
app.use('/api/reasoning', reasoningRoutes);
app.use('/api/refinement', refinementRoutes);
app.use('/api/prediction', predictionRoutes);
app.use('/api/llm', llmRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Setup WebSocket handlers
setupWebSocket(io);

// Start server
const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`🚀 PromptStudio Backend running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export { io };
