import { getStore } from '@netlify/blobs';
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from './authOptions';
import {
  ConflictError,
  JsonStore,
  NotFoundError,
  ValidationError,
} from './userStore';

interface Identity {
  email: string;
  name: string;
}

type Handler = (ctx: Identity & { store: JsonStore }) => Promise<unknown>;

// The signed-in identity always comes from the session cookie, never from the
// request body, so one user cannot read or write another user's record.
export const withUser = async (handler: Handler) => {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  try {
    const store = getStore({ name: 'users', consistency: 'strong' });
    const body = await handler({
      email,
      name: session.user?.name ?? email,
      store: store as unknown as JsonStore,
    });
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('User API request failed', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
};

export const readJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    throw new ValidationError('Request body must be JSON');
  }
};
