/**
 * 캐시 계층.
 * Redis가 있으면 Redis를, 없으면 프로세스 내 TTL 캐시를 쓴다.
 * 파이썬 쪽과 같은 정책이며, 여기서는 의존성을 줄이려 메모리 캐시만 둔다.
 */

import crypto from "node:crypto";

const DEFAULT_TTL = 600;

/** 직렬화 가능한 payload를 안정적인 캐시 키로 바꾼다. */
export function makeKey(prefix, payload) {
  const raw = JSON.stringify(payload, Object.keys(payload ?? {}).sort());
  const digest = crypto.createHash("sha1").update(raw ?? "", "utf8").digest("hex");
  return `${prefix}:${digest.slice(0, 20)}`;
}

class MemoryCache {
  backend = "memory";

  constructor() {
    this.store = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      this.misses += 1;
      return null;
    }
    this.hits += 1;
    return entry.value;
  }

  set(key, value, ttl = DEFAULT_TTL) {
    this.store.set(key, { expiresAt: Date.now() + ttl * 1000, value });
  }

  deletePrefix(prefix) {
    let removed = 0;
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  clear() {
    this.store.clear();
  }

  stats() {
    return {
      backend: this.backend,
      keys: this.store.size,
      hits: this.hits,
      misses: this.misses,
    };
  }
}

export const cache = new MemoryCache();

/** 해당 사용자의 파생 데이터를 모두 버린다. */
export function invalidateUser(userId) {
  cache.deletePrefix(`report:${userId}:`);
  cache.deletePrefix(`game:${userId}`);
  cache.deletePrefix(`logs:${userId}:`);
}

export function invalidateRoutines() {
  cache.deletePrefix("routines:");
}
