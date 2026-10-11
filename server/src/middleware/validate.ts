import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from './errorHandler';

export interface RequestValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validateRequest(schemas: RequestValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as any;
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as any;
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const issues = err.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));
        const issuesSummary = issues
          .map((i) => (i.field ? `${i.field}: ${i.message}` : i.message))
          .join('; ');
        const errorMessage = issuesSummary
          ? `Request validation failed: ${issuesSummary}`
          : 'Request validation failed';
        next(new AppError(errorMessage, 400, 'VALIDATION_ERROR', issues));
        return;
      }
      next(err);
    }
  };
}
