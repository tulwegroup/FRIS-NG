import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getUserPermissions } from './jwt';

export interface AuthenticatedRequest extends NextRequest {
  user?: {
    userId: string;
    email: string;
    role: string;
    permissions: string[];
  };
}

export function withAuth(handler: (req: AuthenticatedRequest) => Promise<NextResponse>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const authHeader = req.headers.get('authorization');
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Missing or invalid authorization header' },
          { status: 401 }
        );
      }

      const token = authHeader.substring(7);
      const payload = verifyToken(token);

      if (!payload) {
        return NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 }
        );
      }

      // Add user info to request
      (req as AuthenticatedRequest).user = payload;

      return await handler(req as AuthenticatedRequest);
    } catch (error) {
      console.error('Authentication error:', error);
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 500 }
      );
    }
  };
}

export function requirePermission(permission: keyof ReturnType<typeof getUserPermissions>) {
  return function <T extends (...args: any[]) => any>(
    handler: T
  ): (req: AuthenticatedRequest, ...args: Parameters<T>) => ReturnType<T> {
    return async (req: AuthenticatedRequest, ...args: Parameters<T>): Promise<NextResponse> => {
      if (!req.user) {
        return NextResponse.json(
          { error: 'User not authenticated' },
          { status: 401 }
        );
      }

      const permissions = getUserPermissions(req.user.role);

      if (!permissions[permission]) {
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        );
      }

      return await handler(req, ...args);
    };
  };
}

export function requireRole(roles: string[]) {
  return function <T extends (...args: any[]) => any>(
    handler: T
  ): (req: AuthenticatedRequest, ...args: Parameters<T>) => ReturnType<T> {
    return async (req: AuthenticatedRequest, ...args: Parameters<T>): Promise<NextResponse> => {
      if (!req.user) {
        return NextResponse.json(
          { error: 'User not authenticated' },
          { status: 401 }
        );
      }

      if (!roles.includes(req.user.role)) {
        return NextResponse.json(
          { error: 'Insufficient role permissions' },
          { status: 403 }
        );
      }

      return await handler(req, ...args);
    };
  };
}