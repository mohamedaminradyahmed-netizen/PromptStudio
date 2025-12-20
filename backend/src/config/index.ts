import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = z.object({
  // Server
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  API_BASE_URL: z.string().url().optional(),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_MIN: z.coerce.number().int().positive().default(2),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  REDIS_MAX_RETRIES: z.coerce.number().int().positive().default(3),
  REDIS_RETRY_DELAY_MS: z.coerce.number().int().positive().default(1000),

  // JWT
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // AI API Keys
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_ORG_ID: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_ENDPOINT: z.string().optional(),
  AZURE_OPENAI_DEPLOYMENT_NAME: z.string().optional(),

  // Cache
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.85),
  CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(10000),
  CACHE_CLEANUP_INTERVAL_MS: z.coerce.number().int().positive().default(300000),

  // Collaboration
  MAX_USERS_PER_SESSION: z.coerce.number().int().positive().default(50),
  SESSION_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(60),
  MAX_SESSIONS_PER_USER: z.coerce.number().int().positive().default(20),
  WS_PING_TIMEOUT: z.coerce.number().int().positive().default(60000),
  WS_PING_INTERVAL: z.coerce.number().int().positive().default(25000),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS: z.coerce.boolean().default(false),

  // File Upload
  MAX_FILE_SIZE_MB: z.coerce.number().positive().default(10),
  ALLOWED_FILE_TYPES: z.string().default('pdf,txt,md,json,yaml,yml'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
  LOG_FORMAT: z.enum(['dev', 'combined', 'common', 'short', 'tiny']).default('dev'),
  LOG_REQUESTS: z.coerce.boolean().default(true),

  // Security
  HELMET_ENABLED: z.coerce.boolean().default(true),
  CORS_CREDENTIALS: z.coerce.boolean().default(true),
  CORS_MAX_AGE: z.coerce.number().int().positive().default(86400),
  CSP_ENABLED: z.coerce.boolean().default(false),

  // Feature Flags
  ENABLE_SWAGGER_DOCS: z.coerce.boolean().default(true),
  ENABLE_METRICS: z.coerce.boolean().default(false),
  ENABLE_HEALTH_CHECKS: z.coerce.boolean().default(true),
  ENABLE_RAG: z.coerce.boolean().default(true),
  ENABLE_CHAINS: z.coerce.boolean().default(true),
  ENABLE_REASONING: z.coerce.boolean().default(true),
  ENABLE_REFINEMENT: z.coerce.boolean().default(true),

  // Monitoring
  SENTRY_DSN: z.string().optional(),
  PROMETHEUS_ENABLED: z.coerce.boolean().default(false),
  PROMETHEUS_PORT: z.coerce.number().int().positive().default(9090),

  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
});

// Parse and validate environment
function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Environment validation failed:');
    result.error.errors.forEach(err => {
      console.error(`  - ${err.path.join('.')}: ${err.message}`);
    });

    // In development, continue with warnings
    if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
      throw new Error('Invalid environment configuration');
    }

    // Return partial config for development
    return envSchema.parse({
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/promptstudio',
      JWT_SECRET: process.env.JWT_SECRET || 'development-secret-key-min-16-chars',
    });
  }

  return result.data;
}

const env = validateEnv();

// Export structured configuration
export const config = {
  server: {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    frontendUrl: env.FRONTEND_URL,
    apiBaseUrl: env.API_BASE_URL || `http://localhost:${env.PORT}`,
    isProduction: env.NODE_ENV === 'production',
    isDevelopment: env.NODE_ENV === 'development',
    isTest: env.NODE_ENV === 'test',
  },

  database: {
    url: env.DATABASE_URL,
    pool: {
      min: env.DATABASE_POOL_MIN,
      max: env.DATABASE_POOL_MAX,
    },
  },

  redis: {
    url: env.REDIS_URL,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
    maxRetries: env.REDIS_MAX_RETRIES,
    retryDelayMs: env.REDIS_RETRY_DELAY_MS,
  },

  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },

  ai: {
    openai: {
      apiKey: env.OPENAI_API_KEY,
      orgId: env.OPENAI_ORG_ID,
    },
    anthropic: {
      apiKey: env.ANTHROPIC_API_KEY,
    },
    google: {
      apiKey: env.GOOGLE_AI_API_KEY,
    },
    azure: {
      apiKey: env.AZURE_OPENAI_API_KEY,
      endpoint: env.AZURE_OPENAI_ENDPOINT,
      deploymentName: env.AZURE_OPENAI_DEPLOYMENT_NAME,
    },
  },

  cache: {
    ttlSeconds: env.CACHE_TTL_SECONDS,
    similarityThreshold: env.SIMILARITY_THRESHOLD,
    maxEntries: env.CACHE_MAX_ENTRIES,
    cleanupIntervalMs: env.CACHE_CLEANUP_INTERVAL_MS,
  },

  collaboration: {
    maxUsersPerSession: env.MAX_USERS_PER_SESSION,
    sessionTimeoutMinutes: env.SESSION_TIMEOUT_MINUTES,
    maxSessionsPerUser: env.MAX_SESSIONS_PER_USER,
    websocket: {
      pingTimeout: env.WS_PING_TIMEOUT,
      pingInterval: env.WS_PING_INTERVAL,
    },
  },

  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    skipSuccessfulRequests: env.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS,
  },

  upload: {
    maxFileSizeMb: env.MAX_FILE_SIZE_MB,
    maxFileSizeBytes: env.MAX_FILE_SIZE_MB * 1024 * 1024,
    allowedFileTypes: env.ALLOWED_FILE_TYPES.split(',').map(t => t.trim()),
  },

  logging: {
    level: env.LOG_LEVEL,
    format: env.LOG_FORMAT,
    logRequests: env.LOG_REQUESTS,
  },

  security: {
    helmetEnabled: env.HELMET_ENABLED,
    cors: {
      credentials: env.CORS_CREDENTIALS,
      maxAge: env.CORS_MAX_AGE,
    },
    cspEnabled: env.CSP_ENABLED,
  },

  features: {
    swaggerDocs: env.ENABLE_SWAGGER_DOCS,
    metrics: env.ENABLE_METRICS,
    healthChecks: env.ENABLE_HEALTH_CHECKS,
    rag: env.ENABLE_RAG,
    chains: env.ENABLE_CHAINS,
    reasoning: env.ENABLE_REASONING,
    refinement: env.ENABLE_REFINEMENT,
  },

  monitoring: {
    sentryDsn: env.SENTRY_DSN,
    prometheus: {
      enabled: env.PROMETHEUS_ENABLED,
      port: env.PROMETHEUS_PORT,
    },
  },

  email: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
  },

  // Legacy compatibility (deprecated - use structured config above)
  openai: {
    apiKey: env.OPENAI_API_KEY || '',
  },
};

export type Config = typeof config;
export default config;
