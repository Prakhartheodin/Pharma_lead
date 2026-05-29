import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';

// Minimal auth stand-in until real auth lands (plan: auth/RBAC is a prerequisite).
// Reads the user id from the X-User-Id header and 401s if absent. Replace the
// header read with real session/JWT verification before this is exposed publicly.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

// User ids are stored as Mongo ObjectIds. A demo header like "demo-user" isn't a
// valid ObjectId and would throw on cast (crashing the request), so map any
// non-ObjectId id to a stable 24-hex derived from it — deterministic per user.
export function toUserObjectId(raw: string): string {
  return OBJECT_ID_RE.test(raw) ? raw : createHash('md5').update(raw).digest('hex').slice(0, 24);
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  const header = req.header('X-User-Id');
  if (!header) {
    return res.status(401).json({ error: 'authentication required (X-User-Id missing)' });
  }
  req.userId = toUserObjectId(header);
  next();
}
