import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export interface UserPermissions {
  canReadDeclarations: boolean;
  canCreateDeclarations: boolean;
  canScoreRisk: boolean;
  canMakeDecisions: boolean;
  canManageCases: boolean;
  canViewKPIs: boolean;
  canOverrideActions: boolean;
  canManageUsers: boolean;
}

export function getUserPermissions(role: string): UserPermissions {
  const permissions: Record<string, UserPermissions> = {
    ADMIN: {
      canReadDeclarations: true,
      canCreateDeclarations: true,
      canScoreRisk: true,
      canMakeDecisions: true,
      canManageCases: true,
      canViewKPIs: true,
      canOverrideActions: true,
      canManageUsers: true,
    },
    VALUATION: {
      canReadDeclarations: true,
      canCreateDeclarations: false,
      canScoreRisk: true,
      canMakeDecisions: true,
      canManageCases: true,
      canViewKPIs: true,
      canOverrideActions: true,
      canManageUsers: false,
    },
    PCA: {
      canReadDeclarations: true,
      canCreateDeclarations: false,
      canScoreRisk: false,
      canMakeDecisions: false,
      canManageCases: true,
      canViewKPIs: true,
      canOverrideActions: false,
      canManageUsers: false,
    },
    ENFORCEMENT: {
      canReadDeclarations: true,
      canCreateDeclarations: false,
      canScoreRisk: true,
      canMakeDecisions: true,
      canManageCases: false,
      canViewKPIs: true,
      canOverrideActions: true,
      canManageUsers: false,
    },
    EXEC_READ: {
      canReadDeclarations: true,
      canCreateDeclarations: false,
      canScoreRisk: false,
      canMakeDecisions: false,
      canManageCases: false,
      canViewKPIs: true,
      canOverrideActions: false,
      canManageUsers: false,
    },
  };

  return permissions[role] || permissions.EXEC_READ;
}