"""캐시 계층.

Redis가 있으면 Redis를, 없으면 프로세스 내 TTL 캐시를 쓴다. 호출부는 어느 쪽인지
알 필요가 없다. 개발 환경에서 Redis를 띄우지 않아도 동작하는 것이 목적이다.

환경변수
- REDIS_URL: 지정하면 그 주소로 접속을 시도한다 (기본 redis://localhost:6379/0)
- FITNESS_DISABLE_REDIS=1: Redis를 아예 쓰지 않고 메모리 캐시로 강제한다
"""

import hashlib
import json
import os
import threading
import time

DEFAULT_TTL = 600


def make_key(prefix, payload):
    """직렬화 가능한 payload를 안정적인 캐시 키로 바꾼다."""
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]
    return f"{prefix}:{digest}"


class MemoryCache:
    """스레드 안전한 TTL 캐시. Redis가 없을 때의 기본값."""

    backend = "memory"

    def __init__(self):
        self._store = {}
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    def get(self, key):
        now = time.time()
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                self.misses += 1
                return None
            expires_at, value = entry
            if expires_at < now:
                del self._store[key]
                self.misses += 1
                return None
            self.hits += 1
            return value

    def set(self, key, value, ttl=DEFAULT_TTL):
        with self._lock:
            self._store[key] = (time.time() + ttl, value)

    def delete_prefix(self, prefix):
        with self._lock:
            doomed = [key for key in self._store if key.startswith(prefix)]
            for key in doomed:
                del self._store[key]
        return len(doomed)

    def clear(self):
        with self._lock:
            self._store.clear()

    def stats(self):
        with self._lock:
            size = len(self._store)
        return {"backend": self.backend, "keys": size, "hits": self.hits, "misses": self.misses}


class RedisCache:
    """Redis 백엔드. 값은 JSON으로 직렬화한다."""

    backend = "redis"

    def __init__(self, client):
        self.client = client
        self.hits = 0
        self.misses = 0

    def get(self, key):
        raw = self.client.get(key)
        if raw is None:
            self.misses += 1
            return None
        self.hits += 1
        return json.loads(raw)

    def set(self, key, value, ttl=DEFAULT_TTL):
        self.client.set(key, json.dumps(value, ensure_ascii=False, default=str), ex=ttl)

    def delete_prefix(self, prefix):
        removed = 0
        for key in self.client.scan_iter(match=f"{prefix}*", count=200):
            self.client.delete(key)
            removed += 1
        return removed

    def clear(self):
        self.client.flushdb()

    def stats(self):
        return {
            "backend": self.backend,
            "keys": self.client.dbsize(),
            "hits": self.hits,
            "misses": self.misses,
        }


def _build_cache():
    if os.environ.get("FITNESS_DISABLE_REDIS") == "1":
        return MemoryCache()

    try:
        import redis  # type: ignore

        url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
        client = redis.Redis.from_url(url, decode_responses=True, socket_connect_timeout=0.5)
        client.ping()
        return RedisCache(client)
    except Exception:
        # redis 미설치, 서버 미기동, 접속 실패 모두 메모리 캐시로 조용히 내려간다.
        return MemoryCache()


cache = _build_cache()


# ------------------------------------------------------------- 무효화 헬퍼

def invalidate_user(user_id):
    """해당 사용자의 파생 데이터를 모두 버린다."""
    cache.delete_prefix(f"report:{user_id}:")
    cache.delete_prefix(f"game:{user_id}")
    cache.delete_prefix(f"logs:{user_id}:")


def invalidate_routines():
    cache.delete_prefix("routines:")
