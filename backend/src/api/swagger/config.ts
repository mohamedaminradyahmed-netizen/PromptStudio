import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'PromptStudio API',
      version: '1.0.0',
      description: `
# PromptStudio API Documentation

PromptStudio is a comprehensive platform for building, optimizing, and managing AI prompts with real-time collaboration features.

## Features

- **Authentication**: JWT-based authentication with guest access
- **Collaboration Sessions**: Real-time collaborative prompt editing
- **Prompt Optimization**: Bayesian and evolutionary optimization
- **RAG Integration**: Knowledge base management and context retrieval
- **Semantic Caching**: Intelligent caching with similarity matching
- **Cost Prediction**: Token and cost estimation for various models

## Authentication

Most endpoints require authentication via Bearer token:
\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

Get a token by registering or logging in through the /api/auth endpoints.
      `,
      contact: {
        name: 'PromptStudio Support',
        email: 'support@promptstudio.dev',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server',
      },
      {
        url: 'https://api.promptstudio.dev',
        description: 'Production server',
      },
    ],
    tags: [
      {
        name: 'Auth',
        description: 'Authentication and user management',
      },
      {
        name: 'Sessions',
        description: 'Collaboration session management',
      },
      {
        name: 'Prompts',
        description: 'Prompt building and optimization',
      },
      {
        name: 'Prediction',
        description: 'Cost and success prediction',
      },
      {
        name: 'RAG',
        description: 'Retrieval-Augmented Generation',
      },
      {
        name: 'Cache',
        description: 'Semantic caching',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Authentication',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  example: 'VALIDATION_ERROR',
                },
                message: {
                  type: 'string',
                  example: 'Invalid request body',
                },
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: { type: 'string' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            avatar: { type: 'string', nullable: true },
            color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                user: { $ref: '#/components/schemas/User' },
                token: { type: 'string' },
                expiresAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        Session: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string', nullable: true },
            content: { type: 'string' },
            isActive: { type: 'boolean' },
            shareToken: { type: 'string' },
            ownerId: { type: 'string', format: 'uuid' },
            owner: { $ref: '#/components/schemas/User' },
            memberCount: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100 },
            total: { type: 'integer' },
            hasMore: { type: 'boolean' },
          },
        },
        PredictionResult: {
          type: 'object',
          properties: {
            tokenEstimation: {
              type: 'object',
              properties: {
                inputTokens: { type: 'integer' },
                estimatedOutputTokens: { type: 'integer' },
                totalTokens: { type: 'integer' },
              },
            },
            costEstimation: {
              type: 'object',
              properties: {
                inputCost: { type: 'number' },
                outputCost: { type: 'number' },
                totalCost: { type: 'number' },
                monthlyCost: { type: 'number' },
              },
            },
            successPrediction: {
              type: 'object',
              properties: {
                probability: { type: 'number', minimum: 0, maximum: 1 },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                factors: { type: 'array', items: { type: 'string' } },
              },
            },
            responseTimeEstimation: {
              type: 'object',
              properties: {
                estimatedSeconds: { type: 'number' },
                range: {
                  type: 'object',
                  properties: {
                    min: { type: 'number' },
                    max: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Access token is missing or invalid',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: {
                success: false,
                error: {
                  code: 'UNAUTHORIZED',
                  message: 'Authentication required',
                },
              },
            },
          },
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        ValidationError: {
          description: 'Validation failed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      },
    },
  },
  apis: ['./src/api/swagger/docs/*.yaml', './src/api/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
