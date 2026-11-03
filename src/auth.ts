import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export type Role = 'DRIVER' | 'FLEET_MANAGER';
export interface AuthUser { id: number; role: Role }
export type AuthedRequest = Request & { user?: AuthUser };

export function signToken(user: AuthUser, secret: string): string {
  return jwt.sign({ sub: user.id, role: user.role }, secret, { expiresIn: '1h' });
}

export function requireAuth(secret: string) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    try {
      const p = jwt.verify(token, secret) as unknown as { sub: number; role: Role };
      req.user = { id: Number(p.sub), role: p.role };
      next();
    } catch {
      res.status(401).json({ error: 'Missing or invalid token' });
    }
  };
}

// Role-based access control: only the listed roles may continue.
export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'You do not have permission to do this' });
      return;
    }
    next();
  };
}
