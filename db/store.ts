import { ProfileInterface, UserInterface } from '@/interface/authInterface';
import { LinkInterface, NodeInterface } from '@/interface/graphInterface';
import { Dispatch, SetStateAction } from 'react';

type SetUser = Dispatch<SetStateAction<UserInterface>>;

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

const request = async (path: string, init?: RequestInit) => {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return (await res.json()) as UserInterface;
};

// Node and link appends run concurrently and can resolve out of order. Every
// server write bumps `version`, and a higher version always contains all
// earlier writes, so a stale response must never replace a newer one.
const applyServerUser = (setUser: SetUser, next: UserInterface) => {
  setUser((prev) =>
    prev.email === next.email && (prev.version ?? 0) > (next.version ?? 0)
      ? prev
      : next
  );
};

export const fetchCurrentUser = async (): Promise<UserInterface | null> => {
  try {
    return await request('/api/user');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
};

export const refreshUserData = async (_user: UserInterface, setUser: SetUser) => {
  const user = await fetchCurrentUser();
  if (user) applyServerUser(setUser, user);
};

export const postUserInfo = async (
  _user: UserInterface,
  userInfo: ProfileInterface
) => {
  await request('/api/user/profile', {
    method: 'PUT',
    body: JSON.stringify({ profile: userInfo }),
  });
};

export const updateUserProfile = async (
  _user: UserInterface,
  setUser: SetUser,
  profile: ProfileInterface
) => {
  const updated = await request('/api/user/profile', {
    method: 'PUT',
    body: JSON.stringify({ profile }),
  });
  applyServerUser(setUser, updated);
};

export const updateUserNodes = async (
  _user: UserInterface,
  setUser: SetUser,
  newNodes: NodeInterface[]
) => {
  const updated = await request('/api/user/nodes', {
    method: 'POST',
    body: JSON.stringify({ nodes: newNodes }),
  });
  applyServerUser(setUser, updated);
};

export const updateUserLinks = async (
  _user: UserInterface,
  setUser: SetUser,
  newLinks: LinkInterface[]
) => {
  const links = newLinks.map((link) => ({
    source: link.source.id,
    target: link.target.id,
  }));
  const updated = await request('/api/user/links', {
    method: 'POST',
    body: JSON.stringify({ links }),
  });
  applyServerUser(setUser, updated);
};

export const deleteLink = async (
  _user: UserInterface,
  setUser: SetUser,
  link: LinkInterface
) => {
  const updated = await request('/api/user/links', {
    method: 'DELETE',
    body: JSON.stringify({
      link: { source: link.source.id, target: link.target.id },
    }),
  });
  applyServerUser(setUser, updated);
};
