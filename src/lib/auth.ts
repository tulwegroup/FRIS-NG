import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

export interface UserPayload {
  id: string;
  email: string;
  role: string;
  permissions: string[];
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export function generateToken(payload: UserPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): UserPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as UserPayload;
  } catch (error) {
    return null;
  }
}

export async function authenticateUser(email: string, password: string): Promise<UserPayload | null> {
  try {
    const user = await db.user.findUnique({
      where: { email }
    });

    if (!user || !user.password) {
      return null;
    }

    const isValidPassword = await verifyPassword(password, user.password);
    if (!isValidPassword) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions || []
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return null;
  }
}

export async function createUser(email: string, password: string, name?: string, role = 'EXEC_READ') {
  const hashedPassword = await hashPassword(password);
  
  return db.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      role,
      permissions: getDefaultPermissions(role)
    }
  });
}

function getDefaultPermissions(role: string): string[] {
  const rolePermissions = {
    ADMIN: ['*'],
    VALUATION: ['risk:read', 'risk:write', 'declaration:read', 'declaration:write'],
    PCA: ['case:read', 'case:write', 'declaration:read'],
    ENFORCEMENT: ['action:read', 'action:write', 'declaration:read'],
    EXEC_READ: ['dashboard:read', 'kpi:read']
  };

  return rolePermissions[role as keyof typeof rolePermissions] || [];
}

export function hasPermission(userPermissions: string[], requiredPermission: string): boolean {
  return userPermissions.includes('*') || userPermissions.includes(requiredPermission);
}

// JWT with short TTL for enhanced security
export function generateShortLivedToken(payload: UserPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
}

// Refresh token for longer sessions
export function generateRefreshToken(payload: UserPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

// Verify refresh token
export function verifyRefreshToken(token: string): UserPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as UserPayload;
  } catch (error) {
    return null;
  }
}