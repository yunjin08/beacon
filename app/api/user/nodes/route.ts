import { readJson, withUser } from '@/lib/server/api';
import { appendNodes, parseNodes } from '@/lib/server/userStore';

export const dynamic = 'force-dynamic';

export const POST = (request: Request) =>
  withUser(async ({ store, email }) => {
    const body = (await readJson(request)) as { nodes?: unknown };
    return appendNodes(store, email, parseNodes(body?.nodes));
  });
