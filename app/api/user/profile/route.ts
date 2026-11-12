import { readJson, withUser } from '@/lib/server/api';
import { parseProfile, setProfile } from '@/lib/server/userStore';

export const dynamic = 'force-dynamic';

export const PUT = (request: Request) =>
  withUser(async ({ store, email }) => {
    const body = (await readJson(request)) as { profile?: unknown };
    return setProfile(store, email, parseProfile(body?.profile));
  });
