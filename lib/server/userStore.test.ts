import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendLinks,
  appendNodes,
  ConflictError,
  getOrCreateUser,
  getUser,
  JsonStore,
  NotFoundError,
  parseLinks,
  parseNodes,
  parseProfile,
  setProfile,
  StoredNode,
  userKey,
  ValidationError,
} from './userStore';

// Mirrors the Blobs semantics the store relies on: every write gets a new
// etag, `onlyIfNew` fails on an existing key, `onlyIfMatch` fails on a stale etag.
// `beforeWrite` lets a test inject a competing write between read and write.
const createFakeStore = ({ etagOnRead = true } = {}) => {
  const entries = new Map<string, { data: string; etag: string }>();
  let etagCounter = 0;
  const hooks: { beforeWrite?: () => Promise<void> } = {};

  const store: JsonStore = {
    async getWithMetadata(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      return { data: JSON.parse(entry.data), etag: etagOnRead ? entry.etag : undefined };
    },
    async setJSON(key, data, options) {
      await hooks.beforeWrite?.();
      const existing = entries.get(key);
      if (options && 'onlyIfNew' in options && existing) return { modified: false };
      if (options && 'onlyIfMatch' in options && existing?.etag !== options.onlyIfMatch) {
        return { modified: false };
      }
      const etag = `e${++etagCounter}`;
      entries.set(key, { data: JSON.stringify(data), etag });
      return { modified: true, etag };
    },
  };
  return { store, entries, hooks };
};

const node = (id: string): StoredNode => ({
  id,
  label: id,
  details: { description: 'd' },
  group: 2,
});

const EMAIL = 'Ada@Example.com';

describe('getOrCreateUser', () => {
  it('creates a new user with the root node on first sign-in', async () => {
    const { store } = createFakeStore();
    const user = await getOrCreateUser(store, EMAIL, 'Ada');
    expect(user).toMatchObject({ name: 'Ada', email: EMAIL, nodeNumber: 2, links: [], version: 1 });
    expect(user.nodes).toEqual([
      { id: 'Node 1', label: 'You', details: { description: 'Root' }, group: 1 },
    ]);
  });

  it('returns the existing record instead of overwriting it', async () => {
    const { store } = createFakeStore();
    await getOrCreateUser(store, EMAIL, 'Ada');
    await appendNodes(store, EMAIL, [node('Node 2')]);
    const again = await getOrCreateUser(store, EMAIL, 'Ada Renamed');
    expect(again.nodes).toHaveLength(2);
    expect(again.name).toBe('Ada');
  });

  it('keys records case-insensitively by email', async () => {
    const { store, entries } = createFakeStore();
    await getOrCreateUser(store, EMAIL, 'Ada');
    expect(await getUser(store, 'ada@example.com')).not.toBeNull();
    expect(Array.from(entries.keys())).toEqual([userKey('ada@example.com')]);
  });

  it('returns the winner when two first sign-ins race', async () => {
    const { store } = createFakeStore();
    const [a, b] = await Promise.all([
      getOrCreateUser(store, EMAIL, 'Ada'),
      getOrCreateUser(store, EMAIL, 'Ada'),
    ]);
    expect(a).toEqual(b);
  });
});

describe('updates', () => {
  it('appends nodes and recomputes nodeNumber', async () => {
    const { store } = createFakeStore();
    await getOrCreateUser(store, EMAIL, 'Ada');
    const user = await appendNodes(store, EMAIL, [node('Node 2'), node('Node 3')]);
    expect(user.nodes.map((n) => n.id)).toEqual(['Node 1', 'Node 2', 'Node 3']);
    expect(user.nodeNumber).toBe(4);
    expect(user.version).toBe(2);
  });

  it('keeps both writes when node and link appends run concurrently', async () => {
    const { store } = createFakeStore();
    await getOrCreateUser(store, EMAIL, 'Ada');
    await Promise.all([
      appendNodes(store, EMAIL, [node('Node 2')]),
      appendLinks(store, EMAIL, [{ source: 'Node 1', target: 'Node 2' }]),
    ]);
    const user = await getUser(store, EMAIL);
    expect(user?.nodes).toHaveLength(2);
    expect(user?.links).toEqual([{ source: 'Node 1', target: 'Node 2' }]);
    expect(user?.version).toBe(3);
  });

  it('retries when another write lands between read and write', async () => {
    const { store, hooks } = createFakeStore();
    await getOrCreateUser(store, EMAIL, 'Ada');
    let injected = false;
    hooks.beforeWrite = async () => {
      if (injected) return;
      injected = true;
      hooks.beforeWrite = undefined;
      await appendLinks(store, EMAIL, [{ source: 'Node 1', target: 'Node 9' }]);
    };
    const user = await appendNodes(store, EMAIL, [node('Node 2')]);
    expect(user.links).toHaveLength(1);
    expect(user.nodes).toHaveLength(2);
  });

  it('gives up with ConflictError under constant contention', async () => {
    const { store, entries, hooks } = createFakeStore();
    await getOrCreateUser(store, EMAIL, 'Ada');
    hooks.beforeWrite = async () => {
      const key = userKey(EMAIL);
      const entry = entries.get(key)!;
      entries.set(key, { ...entry, etag: `${entry.etag}x` });
    };
    await expect(appendNodes(store, EMAIL, [node('Node 2')])).rejects.toBeInstanceOf(ConflictError);
  });

  it('refuses to update a user that does not exist', async () => {
    const { store } = createFakeStore();
    await expect(setProfile(store, EMAIL, {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it('replaces the profile', async () => {
    const { store } = createFakeStore();
    await getOrCreateUser(store, EMAIL, 'Ada');
    await setProfile(store, EMAIL, { interest: ['math'] });
    const user = await setProfile(store, EMAIL, { strength: ['logic'] });
    expect(user.profile).toEqual({ strength: ['logic'] });
  });
});

describe('reads without an etag (the local netlify dev emulator)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('writes unconditionally under netlify dev', async () => {
    vi.stubEnv('NETLIFY_DEV', 'true');
    const { store } = createFakeStore({ etagOnRead: false });
    await getOrCreateUser(store, EMAIL, 'Ada');
    const user = await appendNodes(store, EMAIL, [node('Node 2')]);
    expect(user.nodes).toHaveLength(2);
    expect((await getUser(store, EMAIL))?.nodes).toHaveLength(2);
  });

  it('refuses to write anywhere else', async () => {
    vi.stubEnv('NETLIFY_DEV', '');
    const { store } = createFakeStore({ etagOnRead: false });
    await getOrCreateUser(store, EMAIL, 'Ada');
    await expect(appendNodes(store, EMAIL, [node('Node 2')])).rejects.toBeInstanceOf(ConflictError);
    expect((await getUser(store, EMAIL))?.nodes).toHaveLength(1);
  });
});

describe('request parsing', () => {
  it('strips d3 simulation fields and unknown keys from nodes', () => {
    const [parsed] = parseNodes([
      { ...node('Node 2'), x: 10, vy: 3, index: 0, extra: 'nope', details: { description: 'd', salary: '$1' } },
    ]);
    expect(parsed).toEqual({ id: 'Node 2', label: 'Node 2', group: 2, details: { description: 'd', salary: '$1' } });
  });

  it.each([
    ['not an array', {}],
    ['missing id', [{ label: 'a', group: 1, details: { description: '' } }]],
    ['non-numeric group', [{ id: 'a', label: 'a', group: '1', details: { description: '' } }]],
    ['missing details', [{ id: 'a', label: 'a', group: 1 }]],
    ['bad companies', [{ id: 'a', label: 'a', group: 1, details: { description: '', companies: [1] } }]],
    ['too many items', Array.from({ length: 501 }, (_, i) => node(`Node ${i}`))],
  ])('rejects nodes: %s', (_, input) => {
    expect(() => parseNodes(input)).toThrow(ValidationError);
  });

  it('accepts link ids and rejects resolved node objects', () => {
    expect(parseLinks([{ source: 'a', target: 'b' }])).toEqual([{ source: 'a', target: 'b' }]);
    expect(() => parseLinks([{ source: node('a'), target: 'b' }])).toThrow(ValidationError);
  });

  it('requires every profile field to be a string array', () => {
    expect(parseProfile({ interest: ['a'], custom: [] })).toEqual({ interest: ['a'], custom: [] });
    expect(() => parseProfile({ interest: 'a' })).toThrow(ValidationError);
    expect(() => parseProfile(null)).toThrow(ValidationError);
  });
});
