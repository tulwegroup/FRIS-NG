import { NextRequest, NextResponse } from 'next/server';
import { validateData, validateBusinessRules, declarationSchema } from '@/lib/validation/schemas';
import { logger } from '@/lib/observability';

export function withValidation<T>(
  schema: any, 
  handler: (req: NextRequest, validatedData: T) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    try {
      const body = await req.json();
      
      // Validate schema
      const validationResult = validateData(schema, body);
      
      if (!validationResult.success) {
        logger.warn('Validation failed', {
          errors: validationResult.errors,
          endpoint: req.url
        });

        return NextResponse.json(
          { 
            error: 'Validation failed',
            details: validationResult.errors?.map(err => ({
              field: err.path.join('.'),
              message: err.message
            }))
          },
          { status: 400 }
        );
      }

      // Validate business rules
      const businessRuleErrors = validateBusinessRules(validationResult.data);
      
      if (businessRuleErrors.length > 0) {
        logger.warn('Business rule validation failed', {
          errors: businessRuleErrors,
          endpoint: req.url
        });

        return NextResponse.json(
          { 
            error: 'Business rule validation failed',
            details: businessRuleErrors
          },
          { status: 422 }
        );
      }

      // If validation passes, proceed with the handler
      return handler(req, validationResult.data);

    } catch (error) {
      logger.error('Validation middleware error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        endpoint: req.url
      });

      return NextResponse.json(
        { error: 'Internal server error during validation' },
        { status: 500 }
      );
    }
  };
}