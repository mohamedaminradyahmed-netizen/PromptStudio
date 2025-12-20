import { describe, it, expect, jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery, validateParams, validate } from '../../api/validation/middleware.js';

// Mock request, response, and next
const mockRequest = (data: { body?: any; query?: any; params?: any } = {}): Partial<Request> => ({
  body: data.body || {},
  query: data.query || {},
  params: data.params || {},
});

const mockResponse = (): Partial<Response> => {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res) as any;
  res.json = jest.fn().mockReturnValue(res) as any;
  return res;
};

const mockNext: NextFunction = jest.fn() as any;

describe('Validation Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateBody', () => {
    const testSchema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      age: z.number().int().positive().optional(),
    });

    it('should pass valid body and call next', () => {
      const req = mockRequest({
        body: { name: 'John', email: 'john@example.com' },
      }) as Request;
      const res = mockResponse() as Response;

      validateBody(testSchema)(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid body', () => {
      const req = mockRequest({
        body: { name: '', email: 'invalid' },
      }) as Request;
      const res = mockResponse() as Response;

      validateBody(testSchema)(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            code: 'VALIDATION_ERROR',
          }),
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should transform and set parsed data on request body', () => {
      const schemaWithDefault = z.object({
        name: z.string(),
        status: z.string().default('active'),
      });

      const req = mockRequest({
        body: { name: 'Test' },
      }) as Request;
      const res = mockResponse() as Response;

      validateBody(schemaWithDefault)(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.body.status).toBe('active');
    });
  });

  describe('validateQuery', () => {
    const querySchema = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      search: z.string().optional(),
    });

    it('should parse and coerce query parameters', () => {
      const req = mockRequest({
        query: { page: '2', limit: '50' },
      }) as Request;
      const res = mockResponse() as Response;

      validateQuery(querySchema)(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.query.page).toBe(2);
      expect(req.query.limit).toBe(50);
    });

    it('should apply defaults for missing parameters', () => {
      const req = mockRequest({
        query: {},
      }) as Request;
      const res = mockResponse() as Response;

      validateQuery(querySchema)(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.query.page).toBe(1);
      expect(req.query.limit).toBe(20);
    });

    it('should return 400 for invalid query parameters', () => {
      const req = mockRequest({
        query: { limit: '200' }, // exceeds max of 100
      }) as Request;
      const res = mockResponse() as Response;

      validateQuery(querySchema)(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateParams', () => {
    const paramsSchema = z.object({
      id: z.string().uuid(),
    });

    it('should validate valid UUID params', () => {
      const req = mockRequest({
        params: { id: '550e8400-e29b-41d4-a716-446655440000' },
      }) as Request;
      const res = mockResponse() as Response;

      validateParams(paramsSchema)(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 400 for invalid params', () => {
      const req = mockRequest({
        params: { id: 'not-a-uuid' },
      }) as Request;
      const res = mockResponse() as Response;

      validateParams(paramsSchema)(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validate (combined)', () => {
    const bodySchema = z.object({
      name: z.string().min(1),
    });
    const querySchema = z.object({
      page: z.coerce.number().default(1),
    });
    const paramsSchema = z.object({
      id: z.string().min(1),
    });

    it('should validate all parts successfully', () => {
      const req = mockRequest({
        body: { name: 'Test' },
        query: { page: '1' },
        params: { id: 'abc123' },
      }) as Request;
      const res = mockResponse() as Response;

      validate({
        body: bodySchema,
        query: querySchema,
        params: paramsSchema,
      })(req, res, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 400 with combined errors', () => {
      const req = mockRequest({
        body: { name: '' }, // invalid
        query: { page: '-1' }, // invalid (if schema requires positive)
        params: { id: '' }, // invalid
      }) as Request;
      const res = mockResponse() as Response;

      validate({
        body: bodySchema,
        query: z.object({ page: z.coerce.number().positive() }),
        params: paramsSchema,
      })(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});

describe('Validation Schemas', () => {
  it('should validate email format correctly', () => {
    const emailSchema = z.object({
      email: z.string().email(),
    });

    expect(() => emailSchema.parse({ email: 'valid@example.com' })).not.toThrow();
    expect(() => emailSchema.parse({ email: 'invalid-email' })).toThrow();
  });

  it('should validate color hex format', () => {
    const colorSchema = z.object({
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    });

    expect(() => colorSchema.parse({ color: '#FF5500' })).not.toThrow();
    expect(() => colorSchema.parse({ color: '#ff5500' })).not.toThrow();
    expect(() => colorSchema.parse({ color: 'red' })).toThrow();
    expect(() => colorSchema.parse({ color: '#FFF' })).toThrow();
  });

  it('should validate enum values', () => {
    const roleSchema = z.object({
      role: z.enum(['VIEWER', 'EDITOR', 'OWNER']),
    });

    expect(() => roleSchema.parse({ role: 'EDITOR' })).not.toThrow();
    expect(() => roleSchema.parse({ role: 'ADMIN' })).toThrow();
  });

  it('should validate number ranges', () => {
    const rangeSchema = z.object({
      threshold: z.number().min(0).max(1),
      count: z.number().int().positive(),
    });

    expect(() => rangeSchema.parse({ threshold: 0.5, count: 10 })).not.toThrow();
    expect(() => rangeSchema.parse({ threshold: 1.5, count: 10 })).toThrow();
    expect(() => rangeSchema.parse({ threshold: 0.5, count: -1 })).toThrow();
    expect(() => rangeSchema.parse({ threshold: 0.5, count: 1.5 })).toThrow();
  });
});
