import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
  isOperational?: boolean;
}

/**
 * Error codes for standardized error responses
 */
export const ErrorCodes = {
  // Validation errors (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_FIELD: 'MISSING_FIELD',

  // Authentication errors (401)
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',

  // Authorization errors (403)
  ACCESS_DENIED: 'ACCESS_DENIED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

  // Not found errors (404)
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',

  // Conflict errors (409)
  CONFLICT: 'CONFLICT',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  USER_EXISTS: 'USER_EXISTS',

  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Server errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/**
 * Format Zod validation errors
 */
function formatZodError(error: ZodError): { field: string; message: string }[] {
  return error.errors.map(err => ({
    field: err.path.join('.') || 'root',
    message: err.message,
  }));
}

/**
 * Central error handler middleware
 */
export function errorHandler(
  err: AppError | ZodError | Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error (in production, use proper logging service)
  console.error(`[${new Date().toISOString()}] Error:`, {
    method: req.method,
    path: req.path,
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation failed',
        details: formatZodError(err),
      },
    });
    return;
  }

  // Handle AppError
  const appError = err as AppError;
  const statusCode = appError.statusCode || 500;
  const code = appError.code || ErrorCodes.INTERNAL_ERROR;
  const message = appError.message || 'An unexpected error occurred';

  // Don't expose internal error details in production
  const isProduction = process.env.NODE_ENV === 'production';
  const details = isProduction && statusCode === 500 ? undefined : appError.details;

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: statusCode === 500 && isProduction ? 'An unexpected error occurred' : message,
      details,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
}

/**
 * Create a standardized error
 */
export function createError(
  message: string,
  statusCode: number = 500,
  code: string = ErrorCodes.INTERNAL_ERROR,
  details?: unknown
): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  error.isOperational = true;
  return error;
}

/**
 * Create specific error types
 */
export const Errors = {
  badRequest: (message: string, details?: unknown) =>
    createError(message, 400, ErrorCodes.VALIDATION_ERROR, details),

  unauthorized: (message = 'Authentication required') =>
    createError(message, 401, ErrorCodes.UNAUTHORIZED),

  forbidden: (message = 'Access denied') =>
    createError(message, 403, ErrorCodes.ACCESS_DENIED),

  notFound: (resource = 'Resource') =>
    createError(`${resource} not found`, 404, ErrorCodes.NOT_FOUND),

  conflict: (message: string) =>
    createError(message, 409, ErrorCodes.CONFLICT),

  tooManyRequests: (message = 'Too many requests') =>
    createError(message, 429, ErrorCodes.RATE_LIMIT_EXCEEDED),

  internal: (message = 'Internal server error', details?: unknown) =>
    createError(message, 500, ErrorCodes.INTERNAL_ERROR, details),
};

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: ErrorCodes.NOT_FOUND,
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}

/**
 * Async handler wrapper to catch errors
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
