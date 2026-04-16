# Authentication & Authorization

RedisNavigator supports two authentication methods: local username/password and OIDC/SSO (e.g. Keycloak). Authorization is role-based (RBAC) with per-connection granularity.

---

## Table of Contents

- [Local Authentication](#local-authentication)
- [OIDC / Keycloak SSO](#oidc--keycloak-sso)
  - [How it Works](#how-it-works)
  - [Keycloak Setup](#keycloak-setup)
  - [Application Configuration](#application-configuration)
  - [Docker Compose Example](#docker-compose-example)
  - [Helm Example](#helm-example)
  - [Keycloak Group Sync](#keycloak-group-sync)
- [Authorization & RBAC](#authorization--rbac)
  - [Roles & Permissions](#roles--permissions)
  - [Assigning Roles](#assigning-roles)
  - [Groups via Config-as-Code](#groups-via-config-as-code)
- [Session Management](#session-management)

---

## Local Authentication

By default, a SuperAdmin user is seeded on first startup:

| Field | Value |
|-------|-------|
| Email | `admin@redisnavigator.local` |
| Password | `Admin123!` |

**Change this password immediately after first login.**

Local users authenticate via `POST /api/auth/login` with email and password. Passwords are hashed with bcrypt and never stored in plain text.

---

## OIDC / Keycloak SSO

### How it Works

RedisNavigator implements the **Authorization Code flow with PKCE** using the `openid-client` library. The full flow:

```
Browser                Backend                  Keycloak
  |                       |                         |
  |-- GET /api/auth/oidc ->|                         |
  |                       |-- generate PKCE + state  |
  |                       |-- store in cookie         |
  |<-- redirect ----------|                         |
  |                       |                         |
  |-- GET /authorize -----|------------------------>|
  |<-- redirect to callback|<------------------------|
  |                       |                         |
  |-- GET /api/auth/oidc/callback ----------------->|
  |                       |-- authorizationCodeGrant |
  |                       |<-- id_token + access_token
  |                       |                         |
  |                       |-- find/create local user |
  |                       |-- issue JWT + refresh    |
  |<-- redirect to UI ----|                         |
```

Key security properties:
- **PKCE** prevents authorization code interception attacks
- **State parameter** protects against CSRF
- **HttpOnly cookie** stores the OIDC state during the handshake; the refresh token is also HttpOnly
- User matching: first by `oidcSub` claim, then by email (allowing existing local users to link their SSO account on first login)

### Keycloak Setup

**1. Create a Realm**

In Keycloak Admin Console, create a new realm (e.g. `example-realm`) or use an existing one.

**2. Create a Client**

| Setting | Value |
|---------|-------|
| Client ID | `redisnavigator` |
| Client Protocol | `openid-connect` |
| Access Type | `confidential` |
| Standard Flow | Enabled |
| Direct Access Grants | Disabled (recommended) |
| Root URL | `http://localhost:3000` (or your frontend URL) |
| Valid Redirect URIs | `http://localhost:4000/api/auth/oidc/callback` |
| Web Origins | `http://localhost:3000` |

After saving, navigate to the **Credentials** tab and copy the **Client Secret**.

**3. Required Claims**

RedisNavigator reads the following claims from the ID token:

| Claim | Required | Used For |
|-------|----------|----------|
| `sub` | Yes | Unique user identifier (stored as `oidcSub`) |
| `email` | Yes | User lookup / account creation |
| `name` | No | Display name (falls back to `preferred_username`, then email) |
| `preferred_username` | No | Display name fallback |

Keycloak includes `sub` and `email` by default. Ensure the **email scope** is included in the client's assigned default scopes.

**4. Issuer URL**

The issuer URL follows this pattern:
```
https://<keycloak-host>/realms/<realm-name>
```

Example: `https://iam.example.com/realms/example-realm`

RedisNavigator will automatically discover all OIDC endpoints (authorization, token, userinfo, JWKS) from `<OIDC_ISSUER_URL>/.well-known/openid-configuration`.

### Application Configuration

Set the following environment variables in `backend/.env`:

```env
OIDC_ENABLED=true
OIDC_ISSUER_URL=https://iam.example.com/realms/example-realm
OIDC_CLIENT_ID=redisnavigator
OIDC_CLIENT_SECRET=<client-secret-from-keycloak>
OIDC_REDIRECT_URI=http://localhost:4000/api/auth/oidc/callback
```

Also enable the login button in the frontend:

```env
# frontend/.env.local
VITE_OIDC_ENABLED=true
```

> `OIDC_REDIRECT_URI` must exactly match the **Valid Redirect URIs** configured in Keycloak.

### Docker Compose Example

```yaml
backend:
  environment:
    OIDC_ENABLED: "true"
    OIDC_ISSUER_URL: "https://iam.example.com/realms/example-realm"
    OIDC_CLIENT_ID: "redisnavigator"
    OIDC_CLIENT_SECRET: "your-client-secret"
    OIDC_REDIRECT_URI: "http://localhost:4000/api/auth/oidc/callback"
```

### Helm Example

```yaml
# helm/redis-navigator/values.yaml
oidc:
  enabled: true
  issuerUrl: "https://iam.example.com/realms/example-realm"
  clientId: "redisnavigator"
  clientSecret: "your-client-secret"
  redirectUri: "https://redis-navigator.example.com/api/auth/oidc/callback"
```

---

### Keycloak Group Sync

When `OIDC_SYNC_GROUPS=true`, RedisNavigator automatically mirrors a user's Keycloak group membership into the local group model on every SSO login. This lets you centralise access control in Keycloak: add or remove a user from a Keycloak group and the change takes effect at their next login — no manual steps in the RedisNavigator UI required.

#### How it works

1. After a successful OIDC login, the backend reads an array of group names from the ID token (or userinfo endpoint) using the claim name configured by `OIDC_GROUPS_CLAIM` (default: `groups`).
2. Each name is normalised by stripping any leading `/` so that Keycloak path-style names (e.g. `/DevOps`) match flat names (`DevOps`).
3. The user's existing RedisNavigator group memberships are **fully replaced** to exactly reflect the Keycloak groups — Keycloak is treated as the authoritative source. Memberships that were set manually via the UI or API are overridden.
4. Keycloak groups that have no matching group in RedisNavigator are silently ignored. You must create the group in RedisNavigator first and assign connection permissions to it before the sync will grant access.

#### Keycloak setup

1. In Keycloak Admin Console, open your client, go to **Client Scopes → (your client)-dedicated → Mappers** (or use the client's own **Mappers** tab).
2. Click **Add mapper → By configuration** and select **Group Membership**.
3. Configure the mapper:

   | Field | Value |
   |-------|-------|
   | Name | `groups` |
   | Token Claim Name | `groups` (or your custom claim name) |
   | Full group path | OFF (recommended) — strips the leading `/` automatically; ON also works because RedisNavigator normalises paths |
   | Add to ID token | ON |
   | Add to access token | ON (optional) |
   | Add to userinfo | ON |

4. Save the mapper. Keycloak will now include a `groups` array in the ID token for this client.

#### Application configuration

Add the following variables to `backend/.env` alongside the existing OIDC variables:

```env
OIDC_SYNC_GROUPS=true
# Optional: override the claim name if your mapper uses a different name
# OIDC_GROUPS_CLAIM=groups
```

| Variable | Description | Default |
|----------|-------------|---------|
| `OIDC_SYNC_GROUPS` | Enable Keycloak → RedisNavigator group sync | `false` |
| `OIDC_GROUPS_CLAIM` | ID token claim that contains the group names array | `groups` |

#### End-to-end example

1. Create a group `DevOps` in **Settings → Groups** and assign it `OPERATOR` access to your production Redis connection.
2. In Keycloak, create a group `DevOps` and add users to it.
3. Set `OIDC_SYNC_GROUPS=true` and restart the backend.
4. The next time a member of the Keycloak `DevOps` group logs in via SSO, they are automatically placed in the RedisNavigator `DevOps` group and gain `OPERATOR` access to the production connection.

---

## Authorization & RBAC

### Roles & Permissions

| Role | Permissions |
|------|------------|
| `SUPERADMIN` | Read/write/delete keys, manage connections, manage users — on all connections |
| `ADMIN` | Read/write/delete keys, manage connections, manage users — on assigned connections |
| `OPERATOR` | Read, write, and delete keys — on assigned connections |
| `VIEWER` | Read keys only — on assigned connections |

Roles are assigned per-connection. A user can have different roles on different Redis connections. `SUPERADMIN` role grants access to all connections globally.

### Assigning Roles

There are two mechanisms without config-as-code: **direct user assignment** and **groups**.

#### 1. Direct assignment — at creation time (UI)

When creating a user in **Settings → Users → Create User**, you can optionally pick one connection and a role. This creates a `UserConnectionRole` entry for that user.

To assign additional connections after creation, use the API:

```http
PATCH /api/users/:id/role
Content-Type: application/json

{
  "connectionId": "<connection-id>",
  "role": "VIEWER"
}
```

#### 2. Groups (UI + API)

Groups are the recommended way to assign the same set of connection permissions to multiple users.

**Via the UI (Settings → Groups):**

1. **Create a group** — give it a name and description.
2. **Add members** — pick users from the member dialog.
3. **Assign connections** — open the connections dialog, choose a connection and a role. Repeat for each connection the group should access.
4. All members of the group immediately inherit the assigned roles on those connections.

**Via the API:**

```http
# 1. Create group
POST /api/groups
{ "name": "DevOps", "description": "..." }

# 2. Add a member
POST /api/groups/:groupId/members
{ "userId": "<user-id>" }

# 3. Assign a connection with a role (repeat per connection)
POST /api/groups/:groupId/connections
{ "connectionId": "<connection-id>", "role": "OPERATOR" }
```

To remove access, delete the connection entry from the group or remove the user from the group.

### Groups via Config-as-Code

Groups let you assign multiple users the same role on a connection. Define them in your `config.yaml`:

```yaml
groups:
  - name: "DevOps Team"
    description: "Full access to production Redis"
    members:
      - email: alice@example.com
      - email: bob@example.com
    permissions:
      - name: "Production Redis"    # must match the connection name
        role: OPERATOR              # SUPERADMIN | ADMIN | OPERATOR | VIEWER
      - name: "Dev Redis"
        role: ADMIN

  - name: "Analysts"
    description: "Read-only access"
    members:
      - email: carol@example.com
    permissions:
      - name: "Production Redis"
        role: VIEWER
```

Point the backend at your config file:

```env
CONFIG_FILE=./config.yaml
```

The config is applied on every startup. Entries are created or updated; nothing is deleted automatically. Members are matched by email — if the user does not exist yet (e.g. they have not logged in via SSO for the first time), the group membership is created and will be linked once they do.

> **Note:** RedisNavigator does not automatically map Keycloak **realm roles** to application roles. Use the config-as-code approach or the UI to assign roles after a user's first SSO login. For group-based access, enable [Keycloak Group Sync](#keycloak-group-sync) instead.

---

## Session Management

| Setting | Variable | Default |
|---------|----------|---------|
| Access token lifetime | (hardcoded) | 15 minutes |
| Refresh token lifetime | `SESSION_TIMEOUT_HOURS` | 168 hours (7 days) |

Sessions are **non-rolling**: the refresh token expires at a fixed point from login, regardless of activity.

To revoke all sessions for a user, an Admin can deactivate the account in **Settings → Users**. Refresh tokens are stored in the database and validated on every token refresh.

SSO users cannot change their password through RedisNavigator — password management is handled entirely by Keycloak.
