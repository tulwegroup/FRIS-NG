import { NextRequest, NextResponse } from 'next/server';

export interface SecurityHeaders {
  'Content-Security-Policy'?: string;
  'X-Content-Type-Options'?: string;
  'X-Frame-Options'?: string;
  'X-XSS-Protection'?: string;
  'Strict-Transport-Security'?: string;
  'Referrer-Policy'?: string;
  'Permissions-Policy'?: string;
  'X-Request-ID'?: string;
}

export function getSecurityHeaders(): SecurityHeaders {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'"
    ].join('; '),
    
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };
}

export function withSecurityHeaders(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const response = await handler(req);
    
    // Add security headers
    const securityHeaders = getSecurityHeaders();
    Object.entries(securityHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  };
}

export function validateApiKey(req: NextRequest): boolean {
  const apiKey = req.headers.get('X-API-Key');
  const validApiKey = process.env.API_KEY;
  
  // In production, this would validate against a proper API key management system
  return !validApiKey || apiKey === validApiKey;
}

export function sanitizeInput(input: string): string {
  // Basic input sanitization - in production, use a proper sanitization library
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript protocol
    .replace(/on\w+\s*=/gi, ''); // Remove event handlers
}

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function isSecureConnection(req: NextRequest): boolean {
  // Check if the request is coming over HTTPS
  return req.headers.get('x-forwarded-proto') === 'https' || 
         req.nextUrl.protocol === 'https:';
}

export function rateLimitCheck(req: NextRequest): { allowed: boolean; remaining: number } {
  // Simple rate limiting - in production, use Redis or similar
  const clientId = req.headers.get('x-forwarded-for') || 
                   req.headers.get('x-real-ip') || 
                   'unknown';
  
  // This is a placeholder - implement proper rate limiting in production
  return { allowed: true, remaining: 100 };
}