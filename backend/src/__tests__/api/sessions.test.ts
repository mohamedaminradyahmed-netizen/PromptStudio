import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import { createTestApp, generateTestToken } from '../helpers/testApp.js';
import prisma from '../../lib/prisma.js';

const app = createTestApp();

describe('Sessions API', () => {
  const testUserId = 'user-123';
  const testToken = generateTestToken(testUserId, 'test@example.com', 'Test User');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/sessions', () => {
    it('should create a new session successfully', async () => {
      const mockSession = {
        id: 'session-123',
        name: 'Test Session',
        description: 'A test session',
        content: '',
        isActive: true,
        shareToken: 'share-token-123',
        ownerId: testUserId,
        owner: {
          id: testUserId,
          email: 'test@example.com',
          name: 'Test User',
          avatar: null,
          color: '#3B82F6',
        },
        members: [
          {
            id: 'member-1',
            userId: testUserId,
            role: 'OWNER',
            user: {
              id: testUserId,
              email: 'test@example.com',
              name: 'Test User',
              avatar: null,
              color: '#3B82F6',
            },
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.collaborationSession.create as jest.Mock).mockResolvedValue(mockSession);

      const response = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          name: 'Test Session',
          description: 'A test session',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Test Session');
    });

    it('should return validation error for missing name', async () => {
      const response = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          description: 'A test session',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 without authorization', async () => {
      const response = await request(app)
        .post('/api/sessions')
        .send({
          name: 'Test Session',
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/sessions', () => {
    it('should return user sessions', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          name: 'Session 1',
          description: null,
          isActive: true,
          shareToken: 'share-1',
          ownerId: testUserId,
          owner: {
            id: testUserId,
            email: 'test@example.com',
            name: 'Test User',
            avatar: null,
            color: '#3B82F6',
          },
          members: [],
          _count: { comments: 0, editHistory: 0 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (prisma.collaborationSession.findMany as jest.Mock).mockResolvedValue(mockSessions);

      const response = await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/sessions/:id', () => {
    it('should return session by id for owner', async () => {
      const mockSession = {
        id: 'session-123',
        name: 'Test Session',
        description: 'A test session',
        content: 'Session content',
        isActive: true,
        shareToken: 'share-token-123',
        ownerId: testUserId,
        owner: {
          id: testUserId,
          email: 'test@example.com',
          name: 'Test User',
          avatar: null,
          color: '#3B82F6',
        },
        members: [
          {
            id: 'member-1',
            userId: testUserId,
            role: 'OWNER',
            joinedAt: new Date(),
            lastSeenAt: new Date(),
            user: {
              id: testUserId,
              email: 'test@example.com',
              name: 'Test User',
              avatar: null,
              color: '#3B82F6',
            },
          },
        ],
        comments: [],
        snapshots: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.collaborationSession.findUnique as jest.Mock).mockResolvedValue(mockSession);

      const response = await request(app)
        .get('/api/sessions/session-123')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('session-123');
    });

    it('should return 404 for non-existent session', async () => {
      (prisma.collaborationSession.findUnique as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/sessions/non-existent')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should return 403 for non-member', async () => {
      const mockSession = {
        id: 'session-123',
        name: 'Other Session',
        ownerId: 'other-user',
        members: [], // User is not a member
        owner: { id: 'other-user', email: 'other@example.com', name: 'Other', avatar: null, color: '#EF4444' },
        comments: [],
        snapshots: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.collaborationSession.findUnique as jest.Mock).mockResolvedValue(mockSession);

      const response = await request(app)
        .get('/api/sessions/session-123')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/sessions/:id', () => {
    it('should delete session as owner', async () => {
      const mockSession = {
        id: 'session-123',
        ownerId: testUserId,
      };

      (prisma.collaborationSession.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.collaborationSession.delete as jest.Mock).mockResolvedValue(mockSession);

      const response = await request(app)
        .delete('/api/sessions/session-123')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 403 when deleting as non-owner', async () => {
      const mockSession = {
        id: 'session-123',
        ownerId: 'other-user',
      };

      (prisma.collaborationSession.findUnique as jest.Mock).mockResolvedValue(mockSession);

      const response = await request(app)
        .delete('/api/sessions/session-123')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/sessions/:id/members', () => {
    it('should invite member successfully', async () => {
      const mockSession = {
        id: 'session-123',
        ownerId: testUserId,
      };

      const mockUser = {
        id: 'new-user-id',
        email: 'newuser@example.com',
        name: 'New User',
        avatar: null,
        color: '#10B981',
      };

      const mockMember = {
        id: 'member-new',
        userId: 'new-user-id',
        sessionId: 'session-123',
        role: 'EDITOR',
        user: mockUser,
      };

      (prisma.collaborationSession.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.sessionMember.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.sessionMember.create as jest.Mock).mockResolvedValue(mockMember);

      const response = await request(app)
        .post('/api/sessions/session-123/members')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          email: 'newuser@example.com',
          role: 'EDITOR',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.role).toBe('EDITOR');
    });

    it('should return validation error for invalid role', async () => {
      const response = await request(app)
        .post('/api/sessions/session-123/members')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          email: 'newuser@example.com',
          role: 'INVALID_ROLE',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
