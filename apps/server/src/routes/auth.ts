import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createDefaultCategories,
  createUser,
  deleteUser,
  getSetting,
  getUserByLogin,
  revokeSession,
  revokeUserSessions,
  updateUserPassword,
} from '@financial/database';
import { assertValidPasswordLength, normalizeUsername } from '@financial/domain';
import type { AppState } from '../runtime.js';
import {
  clearSessionCookie,
  createLoginSession,
  hashPassword,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from '../security.js';

const registerSchema = z.object({
  username: z.string(),
  email: z.string().trim().email().optional().nullable(),
  password: z.string(),
});
const loginSchema = z.object({ login: z.string().trim().min(1), password: z.string().min(1) });
const passwordSchema = z.object({ currentPassword: z.string().optional(), newPassword: z.string() });
const deleteSchema = z.object({ password: z.string().min(1) });

function publicUser(user: ReturnType<typeof getUserByLogin> extends infer T ? NonNullable<T> : never) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
  };
}

function normalizedEmail(email: string | null | undefined): string | null {
  return email ? email.trim().toLowerCase() : null;
}

export function registerAuthRoutes(app: FastifyInstance, state: AppState): void {
  app.post(
    '/api/auth/register',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const parsed = registerSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: '注册信息格式无效' });
      if (getSetting(state.database.current, 'registration_open') !== 'true') {
        return reply.code(403).send({ error: 'REGISTRATION_CLOSED', message: '当前已关闭新用户注册' });
      }
      let usernameNormalized: string;
      try {
        usernameNormalized = normalizeUsername(parsed.data.username);
        assertValidPasswordLength(parsed.data.password);
      } catch (error) {
        return reply.code(400).send({ error: 'INVALID_INPUT', message: error instanceof Error ? error.message : '输入无效' });
      }
      const email = parsed.data.email?.trim() || null;
      const emailNormalized = normalizedEmail(email);
      const passwordHash = await hashPassword(parsed.data.password);
      try {
        const user = state.database.current.sqlite.transaction(() => {
          const created = createUser(state.database.current, {
            username: parsed.data.username,
            usernameNormalized,
            email,
            emailNormalized,
            passwordHash,
          });
          createDefaultCategories(state.database.current, created.id);
          return created;
        })();
        const session = createLoginSession(state, user.id);
        setSessionCookie(reply, session.token, state.config.nodeEnv === 'production');
        return reply.code(201).send({ user: publicUser(user) });
      } catch (error) {
        if (error instanceof Error && error.message.includes('UNIQUE')) {
          return reply.code(409).send({ error: 'IDENTIFIER_TAKEN', message: '用户名或邮箱已被占用' });
        }
        throw error;
      }
    },
  );

  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: '登录信息无效' });
      const login = parsed.data.login.toLowerCase();
      const user = getUserByLogin(state.database.current, login);
      if (!user || !(await verifyPassword(user.passwordHash, parsed.data.password))) {
        return reply.code(401).send({ error: 'INVALID_CREDENTIALS', message: '用户名/邮箱或密码错误' });
      }
      if (user.status !== 'active') return reply.code(403).send({ error: 'USER_DISABLED', message: '账号已被禁用' });
      if (user.mustChangePassword && (!user.temporaryPasswordExpiresAt || user.temporaryPasswordExpiresAt < Date.now())) {
        return reply.code(401).send({ error: 'TEMP_PASSWORD_EXPIRED', message: '临时密码已失效，请联系管理员重新重置' });
      }
      const session = createLoginSession(state, user.id);
      if (user.mustChangePassword) {
        updateUserPassword(state.database.current, user.id, await hashPassword(randomBytes(32).toString('base64url')), {
          mustChangePassword: true,
          temporaryPasswordExpiresAt: null,
        });
      }
      setSessionCookie(reply, session.token, state.config.nodeEnv === 'production');
      return { user: { ...publicUser(user), mustChangePassword: user.mustChangePassword } };
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    revokeSession(state.database.current, auth.sessionId);
    clearSessionCookie(reply, state.config.nodeEnv === 'production');
    return { ok: true };
  });

  app.get('/api/me', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    return { user: publicUser(auth.user) };
  });

  app.post('/api/me/password', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const parsed = passwordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: '密码信息无效' });
    try {
      assertValidPasswordLength(parsed.data.newPassword);
    } catch (error) {
      return reply.code(400).send({ error: 'INVALID_PASSWORD', message: error instanceof Error ? error.message : '密码无效' });
    }
    if (!auth.user.mustChangePassword) {
      if (!parsed.data.currentPassword || !(await verifyPassword(auth.user.passwordHash, parsed.data.currentPassword))) {
        return reply.code(401).send({ error: 'INVALID_PASSWORD', message: '当前密码错误' });
      }
    }
    updateUserPassword(state.database.current, auth.user.id, await hashPassword(parsed.data.newPassword), {
      mustChangePassword: false,
      temporaryPasswordExpiresAt: null,
    });
    revokeUserSessions(state.database.current, auth.user.id, auth.sessionId);
    return { ok: true };
  });

  app.delete('/api/me', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    if (auth.user.role === 'admin') return reply.code(403).send({ error: 'ADMIN_DELETE_FORBIDDEN', message: '固定管理员不能通过普通账号注销入口删除' });
    const parsed = deleteSchema.safeParse(request.body);
    if (!parsed.success || !(await verifyPassword(auth.user.passwordHash, parsed.data.password))) {
      return reply.code(401).send({ error: 'INVALID_PASSWORD', message: '密码确认失败' });
    }
    deleteUser(state.database.current, auth.user.id);
    clearSessionCookie(reply, state.config.nodeEnv === 'production');
    return reply.code(204).send();
  });
}
