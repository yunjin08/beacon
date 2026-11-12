import type { ProfileInterface } from '@/interface/authInterface';

export interface StoredNode {
  id: string;
  label: string;
  details: {
    description: string;
    link?: string;
    salary?: string;
    companies?: string[];
    qualifications?: string[];
  };
  group: number;
}

// Links are persisted as node ids; d3 resolves them back to node objects on the client.
export interface StoredLink {
  source: string;
  target: string;
}

export interface UserRecord {
  name: string;
  email: string;
  profile?: ProfileInterface;
  nodes: StoredNode[];
  links: StoredLink[];
  nodeNumber: number;
  // Incremented on every write. Lets the client discard a response that is
  // older than one it already applied when several writes are in flight.
  version: number;
}

// The slice of a Netlify Blobs store this module needs, so tests can supply an
// in-memory fake instead of the real network-backed store.
export interface JsonStore {
  getWithMetadata(
    key: string,
    options: { type: 'json'; consistency: 'strong' }
  ): Promise<{ data: unknown; etag?: string } | null>;
  setJSON(
    key: string,
    data: unknown,
    options?: { onlyIfNew: true } | { onlyIfMatch: string }
  ): Promise<{ modified: boolean; etag?: string }>;
}

export class ValidationError extends Error {}
export class NotFoundError extends Error {}
export class ConflictError extends Error {}

const MAX_WRITE_ATTEMPTS = 5;

const allowUnconditionalWrites = () => process.env.NETLIFY_DEV === 'true';
const MAX_ITEMS_PER_WRITE = 500;

export const userKey = (email: string) =>
  encodeURIComponent(email.trim().toLowerCase());

const initialUser = (email: string, name: string): UserRecord => ({
  name,
  email,
  nodeNumber: 2,
  nodes: [
    {
      id: 'Node 1',
      label: 'You',
      details: { description: 'Root' },
      group: 1,
    },
  ],
  links: [],
  version: 1,
});

const read = async (store: JsonStore, email: string) => {
  const entry = await store.getWithMetadata(userKey(email), {
    type: 'json',
    consistency: 'strong',
  });
  if (!entry) return null;
  return { user: entry.data as UserRecord, etag: entry.etag };
};

export const getUser = async (store: JsonStore, email: string) =>
  (await read(store, email))?.user ?? null;

export const getOrCreateUser = async (
  store: JsonStore,
  email: string,
  name: string
): Promise<UserRecord> => {
  const existing = await read(store, email);
  if (existing) return existing.user;

  const fresh = initialUser(email, name);
  const result = await store.setJSON(userKey(email), fresh, {
    onlyIfNew: true,
  });
  if (result.modified) return fresh;

  // Another request created the record between our read and write.
  const created = await read(store, email);
  if (!created) throw new ConflictError('User record could not be created');
  return created.user;
};

// Optimistic concurrency: re-read and re-apply the change whenever another
// write landed first. The graph UI fires node and link appends concurrently,
// and a plain read-modify-write would silently drop one of them.
export const updateUser = async (
  store: JsonStore,
  email: string,
  change: (user: UserRecord) => Omit<UserRecord, 'version'>
): Promise<UserRecord> => {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const current = await read(store, email);
    if (!current) throw new NotFoundError('User not found');

    const next: UserRecord = {
      ...change(current.user),
      version: (current.user.version ?? 0) + 1,
    };

    if (!current.etag) {
      // The local Blobs emulator in `netlify dev` returns no etag on reads, so
      // conditional writes cannot work there. Production always returns one;
      // outside local dev a missing etag fails loudly rather than risk a lost write.
      if (!allowUnconditionalWrites()) {
        throw new ConflictError('Missing etag on user record');
      }
      await store.setJSON(userKey(email), next);
      return next;
    }

    const result = await store.setJSON(userKey(email), next, {
      onlyIfMatch: current.etag,
    });
    if (result.modified) return next;
  }
  throw new ConflictError('Too many concurrent updates, try again');
};

export const appendNodes = (
  store: JsonStore,
  email: string,
  nodes: StoredNode[]
) =>
  updateUser(store, email, (user) => {
    const updatedNodes = [...user.nodes, ...nodes];
    return { ...user, nodes: updatedNodes, nodeNumber: updatedNodes.length + 1 };
  });

export const appendLinks = (
  store: JsonStore,
  email: string,
  links: StoredLink[]
) =>
  updateUser(store, email, (user) => ({
    ...user,
    links: [...user.links, ...links],
  }));

export const removeLink = (store: JsonStore, email: string, link: StoredLink) =>
  updateUser(store, email, (user) => ({
    ...user,
    links: user.links.filter(
      (l) => l.source != link.source && l.target != link.target
    ),
  }));

export const setProfile = (
  store: JsonStore,
  email: string,
  profile: ProfileInterface
) => updateUser(store, email, (user) => ({ ...user, profile }));

// Request bodies come from the browser, so everything is checked and reduced
// to known fields before it is persisted.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === 'string');

const boundedArray = (value: unknown, field: string): unknown[] => {
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be an array`);
  if (value.length > MAX_ITEMS_PER_WRITE) {
    throw new ValidationError(`${field} has more than ${MAX_ITEMS_PER_WRITE} items`);
  }
  return value;
};

const optionalString = (value: unknown, field: string) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ValidationError(`${field} must be a string`);
  return value;
};

const optionalStringArray = (value: unknown, field: string) => {
  if (value === undefined) return undefined;
  if (!isStringArray(value)) throw new ValidationError(`${field} must be a string array`);
  return value;
};

export const parseNodes = (value: unknown): StoredNode[] =>
  boundedArray(value, 'nodes').map((node, i) => {
    if (!isRecord(node) || !isRecord(node.details)) {
      throw new ValidationError(`nodes[${i}] is malformed`);
    }
    const { id, label, group, details } = node;
    if (typeof id !== 'string' || typeof label !== 'string') {
      throw new ValidationError(`nodes[${i}] needs a string id and label`);
    }
    if (typeof group !== 'number' || !Number.isFinite(group)) {
      throw new ValidationError(`nodes[${i}].group must be a number`);
    }
    if (typeof details.description !== 'string') {
      throw new ValidationError(`nodes[${i}].details.description must be a string`);
    }
    const parsed: StoredNode = {
      id,
      label,
      group,
      details: { description: details.description },
    };
    const link = optionalString(details.link, `nodes[${i}].details.link`);
    const salary = optionalString(details.salary, `nodes[${i}].details.salary`);
    const companies = optionalStringArray(details.companies, `nodes[${i}].details.companies`);
    const qualifications = optionalStringArray(
      details.qualifications,
      `nodes[${i}].details.qualifications`
    );
    if (link !== undefined) parsed.details.link = link;
    if (salary !== undefined) parsed.details.salary = salary;
    if (companies !== undefined) parsed.details.companies = companies;
    if (qualifications !== undefined) parsed.details.qualifications = qualifications;
    return parsed;
  });

export const parseLink = (value: unknown, field = 'link'): StoredLink => {
  if (!isRecord(value)) throw new ValidationError(`${field} is malformed`);
  const { source, target } = value;
  if (typeof source !== 'string' || typeof target !== 'string') {
    throw new ValidationError(`${field} needs string source and target ids`);
  }
  return { source, target };
};

export const parseLinks = (value: unknown): StoredLink[] =>
  boundedArray(value, 'links').map((link, i) => parseLink(link, `links[${i}]`));

export const parseProfile = (value: unknown): ProfileInterface => {
  if (!isRecord(value)) throw new ValidationError('profile must be an object');
  const profile: ProfileInterface = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isStringArray(entry)) {
      throw new ValidationError(`profile.${key} must be a string array`);
    }
    profile[key] = entry;
  }
  return profile;
};
