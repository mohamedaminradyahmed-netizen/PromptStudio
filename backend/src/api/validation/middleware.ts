import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { createError } from '../middleware/errorHandler.js';

/**
 * Validation error response format
 */
export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

/**
 * Format Zod errors into a user-friendly structure
 */
function formatZodErrors(error: ZodError): ValidationError[] {
  return error.errors.map(err => ({
    field: err.path.join('.') || 'root',
    message: err.message,
    code: err.code,
  }));
}

/**
 * Middleware to validate request body against a Zod schema
 */
export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.body);

      if (!result.success) {
        const errors = formatZodErrors(result.error);
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: errors,
          },
        });
        return;
      }

      // Replace body with parsed/transformed data
      req.body = result.data;
      next();
    } catch (error) {
      next(createError('Validation failed', 400, 'VALIDATION_ERROR', error));
    }
  };
}

/**
 * Middleware to validate request query parameters against a Zod schema
 */
export function validateQuery<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.query);

      if (!result.success) {
        const errors = formatZodErrors(result.error);
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: errors,
          },
        });
        return;
      }

      // Replace query with parsed/transformed data
      req.query = result.data as any;
      next();
    } catch (error) {
      next(createError('Query validation failed', 400, 'VALIDATION_ERROR', error));
    }
  };
}

/**
 * Middleware to validate request params against a Zod schema
 */
export function validateParams<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.params);

      if (!result.success) {
        const errors = formatZodErrors(result.error);
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid path parameters',
            details: errors,
          },
        });
        return;
      }

      // Replace params with parsed/transformed data
      req.params = result.data as any;
      next();
    } catch (error) {
      next(createError('Params validation failed', 400, 'VALIDATION_ERROR', error));
    }
  };
}

/**
 * Middleware to validate multiple parts of the request
 */
export function validate<B = unknown, Q = unknown, P = unknown>(options: {
  body?: ZodSchema<B>;
  query?: ZodSchema<Q>;
  params?: ZodSchema<P>;
}): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: ValidationError[] = [];

    try {
      // Validate body
      if (options.body) {
        const bodyResult = options.body.safeParse(req.body);
        if (!bodyResult.success) {
          errors.push(...formatZodErrors(bodyResult.error).map(e => ({
            ...e,
            field: `body.${e.field}`,
          })));
        } else {
          req.body = bodyResult.data;
        }
      }

      // Validate query
      if (options.query) {
        const queryResult = options.query.safeParse(req.query);
        if (!queryResult.success) {
          errors.push(...formatZodErrors(queryResult.error).map(e => ({
            ...e,
            field: `query.${e.field}`,
          })));
        } else {
          req.query = queryResult.data as any;
        }
      }

      // Validate params
      if (options.params) {
        const paramsResult = options.params.safeParse(req.params);
        if (!paramsResult.success) {
          errors.push(...formatZodErrors(paramsResult.error).map(e => ({
            ...e,
            field: `params.${e.field}`,
          })));
        } else {
          req.params = paramsResult.data as any;
        }
      }

      if (errors.length > 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: errors,
          },
        });
        return;
      }

      next();
    } catch (error) {
      next(createError('Validation failed', 400, 'VALIDATION_ERROR', error));
    }
  };
}

/**
 * Async handler wrapper to catch errors and pass to error handler
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
