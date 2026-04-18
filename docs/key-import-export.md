# Key Import / Export

The Key Browser supports exporting selected keys to a JSON file and importing them back into any connection or database.

## Export

1. Select one or more keys using the checkboxes in the key list.
2. Click **Export** in the bulk action toolbar that appears at the bottom of the list.
3. The browser downloads `redis-keys-<connectionId>-db<N>.json` containing the full data for each selected key.

## Import

1. Click the **Upload** (↑) button in the toolbar next to the **+** (Add Key) button.
2. Choose a `.json` file that matches the format described below.
3. Set options:
   - **Overwrite existing keys** — if unchecked, any key that already exists in Redis is skipped; if checked, its value is overwritten with `SET`/`PUT`.
   - **Preserve TTL** — if checked, the original TTL (in seconds) is restored on each key. Keys with `ttl: -1` (no expiry) are always imported without an expiry regardless of this setting.
4. Click **Import N Keys**.
5. A progress bar tracks each key. When finished, a summary shows how many succeeded and how many failed.

## JSON Format

The import file must be a JSON array. Each element represents one Redis key.

### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `key` | `string` | The Redis key name |
| `type` | `string` | One of `string`, `hash`, `list`, `set`, `zset` |
| `value` | — | The key's value (shape depends on `type`, see below) |

### Optional fields

| Field | Type | Description |
|-------|------|-------------|
| `ttl` | `number` | Seconds until expiry. `-1` means no expiry. Ignored on import unless **Preserve TTL** is checked and the value is `> 0`. |

### Value shapes by type

| Type | `value` shape | Example |
|------|--------------|---------|
| `string` | `string` | `"hello world"` |
| `hash` | `Record<string, string>` | `{ "field1": "val1", "field2": "val2" }` |
| `list` | `string[]` | `["item1", "item2"]` |
| `set` | `string[]` | `["member1", "member2"]` |
| `zset` | `Array<{ member: string; score: number }>` | `[{ "member": "alice", "score": 1.5 }]` |

> **Note:** `stream` keys are not importable. They can be exported (read-only), but the import dialog will fail gracefully on any key with an unsupported type.

### Minimal example

```json
[
  {
    "key": "mykey",
    "type": "string",
    "ttl": -1,
    "value": "hello world"
  }
]
```

### Full example with all types

```json
[
  {
    "key": "user:1:name",
    "type": "string",
    "ttl": -1,
    "value": "Alice"
  },
  {
    "key": "user:1:profile",
    "type": "hash",
    "ttl": 3600,
    "value": { "age": "30", "city": "Tehran" }
  },
  {
    "key": "recent:logins",
    "type": "list",
    "ttl": -1,
    "value": ["2026-04-17", "2026-04-16"]
  },
  {
    "key": "user:1:tags",
    "type": "set",
    "ttl": -1,
    "value": ["admin", "editor"]
  },
  {
    "key": "leaderboard",
    "type": "zset",
    "ttl": -1,
    "value": [
      { "member": "alice", "score": 100 },
      { "member": "bob", "score": 85 }
    ]
  }
]
```

The easiest way to produce a valid import file is to use the **Export** button on existing keys — the exported file can be imported directly without modification.
