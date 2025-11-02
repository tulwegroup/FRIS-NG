import { NextRequest, NextResponse } from 'next/server';
import { createRequestLogger, measureApiTime } from '@/lib/observability';

export function withObservability(handler: (req: NextRequest) => Promise<NextResponse>, endpoint: string) {
  return async (req: NextRequest) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const logger = createRequestLogger(requestId);
    
    // Add request ID to response headers
    const startTime = Date.now();
    
    try {
      logger.info('Request started', {
        method: req.method,
        url: req.url,
        userAgent: req.headers.get('user-agent'),
        endpoint
      });

      const response = await handler(req);

      const duration = Date.now() - startTime;
      
      logger.info('Request completed', {
        status: response.status,
        duration,
        endpoint
      });

      // Add observability headers
      response.headers.set('X-Request-ID', requestId);
      response.headers.set('X-Response-Time', duration.toString());

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Request failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
        endpoint
      });

      return NextResponse.json(
        { error: 'Internal server error', requestId },
        { status: 500, headers: { 'X-Request-ID': requestId } }
      );
    }
  };
}