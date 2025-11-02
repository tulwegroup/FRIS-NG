import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/middleware/auth';
import { withSecurityHeaders, validateApiKey, generateRequestId } from '@/lib/security';
import { logger } from '@/lib/observability';

export function withSecureHandler(
  handler: (req: NextRequest) => Promise<NextResponse>,
  requiredPermissions: string[] = [],
  requireApiKey: boolean = false
) {
  return async (req: NextRequest) => {
    const requestId = generateRequestId();
    
    try {
      // Add request ID to headers for tracking
      const response = await handler(req);
      response.headers.set('X-Request-ID', requestId);
      
      return response;
    } catch (error) {
      logger.error('Secure handler error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId
      });

      return NextResponse.json(
        { 
          error: 'Internal server error',
          requestId 
        },
        { 
          status: 500,
          headers: { 'X-Request-ID': requestId }
        }
      );
    }
  };
}

export function createSecureEndpoint(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: {
    requiredPermissions?: string[];
    requireApiKey?: boolean;
    requireAuth?: boolean;
  } = {}
) {
  const { 
    requiredPermissions = [], 
    requireApiKey = false, 
    requireAuth = true 
  } = options;

  let secureHandler = handler;

  // Add security headers
  secureHandler = withSecurityHeaders(secureHandler);

  // Add authentication if required
  if (requireAuth) {
    secureHandler = withAuth(secureHandler, requiredPermissions);
  }

  // Add API key validation if required
  if (requireApiKey) {
    secureHandler = async (req: NextRequest) => {
      if (!validateApiKey(req)) {
        return NextResponse.json(
          { error: 'Invalid or missing API key' },
          { status: 401 }
        );
      }
      return handler(req);
    };
  }

  // Add request ID and error handling
  secureHandler = withSecureHandler(secureHandler, requiredPermissions, requireApiKey);

  return secureHandler;
}