import { Request } from 'express';
import { UserRole, Permission } from '@prisma/client';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

export interface ConnectionAccessRequest extends AuthenticatedRequest {
  connectionRole?: {
    role: UserRole;
    permissions: Permission[];
  };
}

export type { UserRole, Permission };
