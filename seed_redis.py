#!/usr/bin/env python3
"""
Seed Redis with random keys of various types.
Targets the local redis-sample container defined in docker-compose.yml.
"""

import random
import string
import argparse

try:
    import redis
except ImportError:
    print("redis-py not found. Install it with:  pip install redis")
    raise SystemExit(1)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def rand_str(length: int = 12) -> str:
    return "".join(random.choices(string.ascii_letters + string.digits, k=length))


def rand_float() -> float:
    return round(random.uniform(0, 10_000), 4)


def rand_int(lo: int = 0, hi: int = 100_000) -> int:
    return random.randint(lo, hi)


# ---------------------------------------------------------------------------
# Seeders per Redis type
# ---------------------------------------------------------------------------

def seed_strings(r: redis.Redis, n: int) -> None:
    pipe = r.pipeline()
    for _ in range(n):
        key = f"string:{rand_str()}"
        value = rand_str(random.randint(8, 64))
        pipe.set(key, value)
    pipe.execute()
    print(f"  [string]      {n} keys")


def seed_hashes(r: redis.Redis, n: int) -> None:
    pipe = r.pipeline()
    for _ in range(n):
        key = f"hash:{rand_str()}"
        fields = {rand_str(6): rand_str(10) for _ in range(random.randint(2, 8))}
        pipe.hset(key, mapping=fields)
    pipe.execute()
    print(f"  [hash]        {n} keys")


def seed_lists(r: redis.Redis, n: int) -> None:
    pipe = r.pipeline()
    for _ in range(n):
        key = f"list:{rand_str()}"
        items = [rand_str(8) for _ in range(random.randint(3, 10))]
        pipe.rpush(key, *items)
    pipe.execute()
    print(f"  [list]        {n} keys")


def seed_sets(r: redis.Redis, n: int) -> None:
    pipe = r.pipeline()
    for _ in range(n):
        key = f"set:{rand_str()}"
        members = {rand_str(8) for _ in range(random.randint(3, 10))}
        pipe.sadd(key, *members)
    pipe.execute()
    print(f"  [set]         {n} keys")


def seed_sorted_sets(r: redis.Redis, n: int) -> None:
    pipe = r.pipeline()
    for _ in range(n):
        key = f"zset:{rand_str()}"
        mapping = {rand_str(8): rand_float() for _ in range(random.randint(3, 10))}
        pipe.zadd(key, mapping)
    pipe.execute()
    print(f"  [sorted set]  {n} keys")


def seed_json_strings(r: redis.Redis, n: int) -> None:
    """Store JSON-like payloads as plain strings."""
    import json
    pipe = r.pipeline()
    for _ in range(n):
        key = f"json:{rand_str()}"
        payload = {
            "id": rand_int(),
            "name": rand_str(8),
            "score": rand_float(),
            "tags": [rand_str(4) for _ in range(random.randint(1, 4))],
        }
        pipe.set(key, json.dumps(payload))
    pipe.execute()
    print(f"  [json-string] {n} keys")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Redis with random keys.")
    parser.add_argument("--host",     default="127.0.0.1", help="Redis host (default: 127.0.0.1)")
    parser.add_argument("--port",     default=6379, type=int, help="Redis port (default: 6379)")
    parser.add_argument("--password", default="samplepassword", help="Redis password")
    parser.add_argument("--db",       default=0, type=int, help="Redis DB index (default: 0)")
    parser.add_argument("-n", "--count", default=20, type=int,
                        help="Number of keys per type (default: 20)")
    args = parser.parse_args()

    r = redis.Redis(
        host=args.host,
        port=args.port,
        password=args.password,
        db=args.db,
        decode_responses=True,
    )

    try:
        r.ping()
    except redis.exceptions.ConnectionError as exc:
        print(f"Cannot connect to Redis at {args.host}:{args.port} — {exc}")
        raise SystemExit(1)

    print(f"Connected to Redis {args.host}:{args.port} db={args.db}")
    print(f"Inserting {args.count} keys per type …\n")

    seed_strings(r, args.count)
    seed_hashes(r, args.count)
    seed_lists(r, args.count)
    seed_sets(r, args.count)
    seed_sorted_sets(r, args.count)
    seed_json_strings(r, args.count)

    total = args.count * 6
    print(f"\nDone — {total} keys inserted.")


if __name__ == "__main__":
    main()
