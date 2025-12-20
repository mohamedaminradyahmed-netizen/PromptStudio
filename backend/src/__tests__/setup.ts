import { beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';

// Mock Prisma
jest.mock('../lib/prisma.js', () => ({
  default: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    collaborationSession: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    sessionMember: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    editHistory: {
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    sessionSnapshot: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    semanticCache: {
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  },
}));

// Mock Redis
jest.mock('../lib/redis.js', () => ({
  default: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
    expire: jest.fn(),
  },
}));

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.JWT_EXPIRES_IN = '1h';
process.env.PORT = '3099';

// Global test setup
beforeAll(async () => {
  // Setup before all tests
});

afterAll(async () => {
  // Cleanup after all tests
});

beforeEach(() => {
  // Reset mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Cleanup after each test
});

// Extend expect with custom matchers if needed
expect.extend({
  toBeValidResponse(received) {
    const pass = received && typeof received === 'object' && 'success' in received;
    if (pass) {
      return {
        message: () => `expected ${JSON.stringify(received)} not to be a valid API response`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${JSON.stringify(received)} to be a valid API response with 'success' property`,
        pass: false,
      };
    }
  },
});

// Declare custom matcher types
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidResponse(): R;
    }
  }
}
