import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import { createTestApp } from '../helpers/testApp.js';

const app = createTestApp();

describe('Prediction API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/prediction/analyze', () => {
    it('should analyze prompt successfully', async () => {
      const response = await request(app)
        .post('/api/prediction/analyze')
        .send({
          prompt: 'Write a function to calculate fibonacci numbers',
          model: 'gpt-4',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('tokenEstimation');
      expect(response.body.data).toHaveProperty('costEstimation');
      expect(response.body.data).toHaveProperty('successPrediction');
    });

    it('should return validation error for missing prompt', async () => {
      const response = await request(app)
        .post('/api/prediction/analyze')
        .send({
          model: 'gpt-4',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should use default model when not provided', async () => {
      const response = await request(app)
        .post('/api/prediction/analyze')
        .send({
          prompt: 'Test prompt',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/prediction/quick', () => {
    it('should perform quick analysis', async () => {
      const response = await request(app)
        .post('/api/prediction/quick')
        .send({
          prompt: 'Hello, how are you?',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });
  });

  describe('POST /api/prediction/tokens', () => {
    it('should estimate tokens correctly', async () => {
      const response = await request(app)
        .post('/api/prediction/tokens')
        .send({
          prompt: 'This is a test prompt for token estimation',
          model: 'gpt-4',
          expectedOutputLength: 'medium',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('inputTokens');
      expect(response.body.data).toHaveProperty('estimatedOutputTokens');
    });

    it('should validate expectedOutputLength enum', async () => {
      const response = await request(app)
        .post('/api/prediction/tokens')
        .send({
          prompt: 'Test prompt',
          expectedOutputLength: 'invalid',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/prediction/cost', () => {
    it('should estimate cost correctly', async () => {
      const response = await request(app)
        .post('/api/prediction/cost')
        .send({
          prompt: 'Calculate the sum of 1 to 100',
          model: 'gpt-4',
          requestsPerMonth: 100,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('tokens');
    });
  });

  describe('POST /api/prediction/success', () => {
    it('should predict success probability', async () => {
      const response = await request(app)
        .post('/api/prediction/success')
        .send({
          prompt: 'Write clear and concise code to sort an array',
          model: 'gpt-4',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('probability');
    });
  });

  describe('POST /api/prediction/response-time', () => {
    it('should estimate response time', async () => {
      const response = await request(app)
        .post('/api/prediction/response-time')
        .send({
          prompt: 'Generate a short poem',
          model: 'gpt-4',
          expectedOutputLength: 'short',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('estimatedSeconds');
    });
  });

  describe('GET /api/prediction/models', () => {
    it('should return available models', async () => {
      const response = await request(app)
        .get('/api/prediction/models');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/prediction/compare', () => {
    it('should compare multiple models', async () => {
      const response = await request(app)
        .post('/api/prediction/compare')
        .send({
          prompt: 'Explain quantum computing in simple terms',
          models: ['gpt-4', 'gpt-3.5-turbo'],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('comparisons');
      expect(response.body.data).toHaveProperty('recommendations');
    });

    it('should return validation error for empty models array', async () => {
      const response = await request(app)
        .post('/api/prediction/compare')
        .send({
          prompt: 'Test prompt',
          models: [],
        });

      expect(response.status).toBe(400);
    });
  });
});
