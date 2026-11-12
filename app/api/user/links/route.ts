import { readJson, withUser } from '@/lib/server/api';
import {
  appendLinks,
  parseLink,
  parseLinks,
  removeLink,
} from '@/lib/server/userStore';

export const dynamic = 'force-dynamic';

export const POST = (request: Request) =>
  withUser(async ({ store, email }) => {
    const body = (await readJson(request)) as { links?: unknown };
    return appendLinks(store, email, parseLinks(body?.links));
  });

export const DELETE = (request: Request) =>
  withUser(async ({ store, email }) => {
    const body = (await readJson(request)) as { link?: unknown };
    return removeLink(store, email, parseLink(body?.link));
  });
