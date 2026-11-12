import { withUser } from '@/lib/server/api';
import { getOrCreateUser } from '@/lib/server/userStore';

export const dynamic = 'force-dynamic';

export const GET = () =>
  withUser(({ store, email, name }) => getOrCreateUser(store, email, name));
