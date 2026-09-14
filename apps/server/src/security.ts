import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  createSession,
  getSessionUserByTokenHash,
  type UserRecord,
} from '@financial/database';
import type { AppState } from './runtime.js';

export const SESSION_COOKIE = 'ledger_session';

export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
  });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newSessionToken(): { id: string; token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { id: randomUUID(), token, tokenHash: hashSessionToken(token) };
}

export function setSessionCookie(reply: FastifyReply, token: string, production: boolean): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    expires: new Date('9999-12-31T23:59:59.000Z'),
    signed: true,
  });
}

export function clearSessionCookie(reply: FastifyReply, production: boolean): void {
  reply.clearCookie(SESSION_COOKIE, {
    path: '/',
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
  });
}

export function createLoginSession(state: AppState, userId: number): { token: string; sessionId: string } {
  const session = newSessionToken();
  createSession(state.database.current, {
    id: session.id,
    userId,
    tokenHash: session.tokenHash,
  });
  return { token: session.token, sessionId: session.id };
}

export type AuthContext = { sessionId: string; user: UserRecord };

export function getAuth(request: FastifyRequest, state: AppState): AuthContext | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  return getSessionUserByTokenHash(state.database.current, hashSessionToken(unsigned.value));
}

export function requireAuth(request: FastifyRequest, reply: FastifyReply, state: AppState): AuthContext | null {
  const auth = getAuth(request, state);
  if (!auth || auth.user.status !== 'active') {
    clearSessionCookie(reply, state.config.nodeEnv === 'production');
    void reply.code(401).send({ error: 'UNAUTHENTICATED', message: '请先登录' });
    return null;
  }
  return auth;
}

export function requireAdmin(request: FastifyRequest, reply: FastifyReply, state: AppState): AuthContext | null {
  const auth = requireAuth(request, reply, state);
  if (!auth) return null;
  if (auth.user.role !== 'admin') {
    void reply.code(403).send({ error: 'FORBIDDEN', message: '需要管理员权限' });
    return null;
  }
  return auth;
}
