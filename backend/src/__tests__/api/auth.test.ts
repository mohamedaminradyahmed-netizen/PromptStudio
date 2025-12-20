import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import { createTestApp } from '../helpers/testApp.js';
import prisma from '../../lib/prisma.js';

const app = createTestApp();

describe('Auth API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar: null,
        color: '#3B82F6',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          name: 'Test User',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.user.email).toBe('test@example.com');
    });

    it('should return validation error for missing email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return validation error for invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          name: 'Test User',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return conflict error if user already exists', async () => {
      const existingUser = {
        id: 'user-123',
        email: 'existing@example.com',
        name: 'Existing User',
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(existingUser);

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'existing@example.com',
          name: 'New User',
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CONFLICT');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with valid email', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar: null,
        color: '#3B82F6',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('token');
    });

    it('should return not found error for non-existent user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should return validation error for missing email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/auth/guest', () => {
    it('should create a guest user successfully', async () => {
      const mockGuestUser = {
        id: 'guest-123',
        email: 'abc123@guest.promptstudio',
        name: 'Guest_abc123',
        avatar: null,
        color: '#EF4444',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.user.create as jest.Mock).mockResolvedValue(mockGuestUser);

      const response = await request(app)
        .post('/api/auth/guest')
        .send({});

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.isGuest).toBe(true);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return 401 without authorization header', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });
});
