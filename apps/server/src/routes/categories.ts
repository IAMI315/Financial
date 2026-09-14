import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createCategory,
  deleteUnusedCategory,
  getCategory,
  listCategories,
  updateCategory,
} from '@financial/database';
import type { AppState } from '../runtime.js';
import { requireAuth } from '../security.js';

const createSchema = z.object({
  type: z.enum(['income', 'expense']),
  name: z.string().trim().min(1).max(40),
  parentId: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});
const updateSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  isArchived: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export function registerCategoryRoutes(app: FastifyInstance, state: AppState): void {
  app.get('/api/categories', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const query = z.object({ includeArchived: z.enum(['true', 'false']).optional() }).safeParse(request.query);
    const includeArchived = query.success ? query.data.includeArchived !== 'false' : true;
    return { categories: listCategories(state.database.current, auth.user.id, includeArchived) };
  });

  app.post('/api/categories', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: '分类信息无效' });
    if (parsed.data.parentId != null) {
      const parent = getCategory(state.database.current, auth.user.id, parsed.data.parentId);
      if (!parent || parent.parentId !== null) return reply.code(400).send({ error: 'INVALID_PARENT', message: '父分类不存在或层级无效' });
      if (parent.type !== parsed.data.type) return reply.code(400).send({ error: 'TYPE_MISMATCH', message: '二级分类必须继承一级分类类型' });
      if (parent.isArchived) return reply.code(400).send({ error: 'PARENT_ARCHIVED', message: '不能在归档分类下新建二级分类' });
    }
    const category = createCategory(state.database.current, auth.user.id, parsed.data);
    return reply.code(201).send({ category });
  });

  app.patch('/api/categories/:id', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
    const body = updateSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: '分类修改信息无效' });
    const category = updateCategory(state.database.current, auth.user.id, params.data.id, body.data);
    if (!category) return reply.code(404).send({ error: 'NOT_FOUND', message: '分类不存在' });
    return { category };
  });

  app.delete('/api/categories/:id', async (request, reply) => {
    const auth = requireAuth(request, reply, state);
    if (!auth) return;
    const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'INVALID_INPUT', message: '分类 ID 无效' });
    const result = deleteUnusedCategory(state.database.current, auth.user.id, params.data.id);
    if (result === 'not-found') return reply.code(404).send({ error: 'NOT_FOUND', message: '分类不存在' });
    if (result === 'used') return reply.code(409).send({ error: 'CATEGORY_USED', message: '分类已有历史交易，请改为归档' });
    if (result === 'children') return reply.code(409).send({ error: 'CATEGORY_HAS_CHILDREN', message: '请先处理该分类的二级分类' });
    return reply.code(204).send();
  });
}
