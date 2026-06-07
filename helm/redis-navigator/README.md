# RedisNavigator Helm Chart

This chart deploys RedisNavigator to Kubernetes with:

- a backend deployment and service
- a frontend deployment and service
- Kubernetes Secrets for backend secrets and database connection
- optional Ingress
- optional OIDC configuration
- optional config-as-code YAML mount

## Prerequisites

- Kubernetes 1.24+
- Helm 3.12+
- an external PostgreSQL database reachable from the cluster

## Install From This Repository

If you are working directly from a clone of this repository, install the chart from the local path:

```bash
helm install redis-navigator ./helm/redis-navigator \
  --namespace redis-navigator \
  --create-namespace \
  --set backend.secret.jwtAccessSecret="replace-with-a-long-random-secret" \
  --set backend.secret.jwtRefreshSecret="replace-with-another-long-random-secret" \
  --set backend.secret.encryptionKey="12345678901234567890123456789012" \
  --set externalDatabase.host="postgres.example.internal" \
  --set externalDatabase.name="redisnavigator_db" \
  --set externalDatabase.user="redisnavigator" \
  --set externalDatabase.password="replace-with-db-password"
```

Notes:

- `backend.secret.encryptionKey` must be exactly 32 characters.
- The default chart values are development-friendly placeholders and should be overridden before a real deployment.
- If your PostgreSQL password contains special characters, prefer `externalDatabase.existingSecret` with a full `DATABASE_URL`.

## Install From A Published Helm Repository

This repository publishes the chart as a GitHub Pages-backed Helm repository through the workflow at [`.github/workflows/helm-chart-release.yml`](../../.github/workflows/helm-chart-release.yml).

After GitHub Pages is enabled for the repository, install it with:

```bash
helm repo add redisnavigator https://themkarimi.github.io/redisnavigator
helm repo update

helm install redis-navigator redisnavigator/redis-navigator \
  --namespace redis-navigator \
  --create-namespace \
  --set backend.secret.jwtAccessSecret="replace-with-a-long-random-secret" \
  --set backend.secret.jwtRefreshSecret="replace-with-another-long-random-secret" \
  --set backend.secret.encryptionKey="12345678901234567890123456789012" \
  --set externalDatabase.host="postgres.example.internal" \
  --set externalDatabase.name="redisnavigator_db" \
  --set externalDatabase.user="redisnavigator" \
  --set externalDatabase.password="replace-with-db-password"
```

If you are testing from a fork, replace the URL with your own GitHub Pages chart index.

## Recommended Values File

Using a values file is usually cleaner than a long `--set` command:

```yaml
backend:
  frontendUrl: "https://redis-navigator.example.com"
  secret:
    jwtAccessSecret: "replace-with-a-long-random-secret"
    jwtRefreshSecret: "replace-with-another-long-random-secret"
    encryptionKey: "12345678901234567890123456789012"

externalDatabase:
  host: "postgres.example.internal"
  port: 5432
  name: "redisnavigator_db"
  user: "redisnavigator"
  password: "replace-with-db-password"

ingress:
  enabled: true
  className: nginx
  host: "redis-navigator.example.com"
  tls:
    - secretName: redis-navigator-tls
      hosts:
        - redis-navigator.example.com
```

Install with:

```bash
helm install redis-navigator ./helm/redis-navigator \
  --namespace redis-navigator \
  --create-namespace \
  -f values.yaml
```

Or, after publishing the chart:

```bash
helm install redis-navigator redisnavigator/redis-navigator \
  --namespace redis-navigator \
  --create-namespace \
  -f values.yaml
```

## Upgrade

```bash
helm upgrade redis-navigator ./helm/redis-navigator \
  --namespace redis-navigator \
  -f values.yaml
```

If you are installing from a published Helm repo:

```bash
helm repo update
helm upgrade redis-navigator redisnavigator/redis-navigator \
  --namespace redis-navigator \
  -f values.yaml
```

## Publishing

The workflow at [`.github/workflows/helm-chart-release.yml`](../../.github/workflows/helm-chart-release.yml):

- runs on pushes to `main` or `master` when files under `helm/` change
- can also be run manually with `workflow_dispatch`
- lints the chart with `helm lint helm/redis-navigator`
- packages charts from `helm/`
- publishes the chart repository to the `gh-pages` branch using `helm/chart-releaser-action`

To make `helm repo add redisnavigator https://themkarimi.github.io/redisnavigator` work:

1. Go to GitHub repository `Settings > Pages`.
2. Set the source to deploy from the `gh-pages` branch.
3. Push a change under `helm/` or run the workflow manually once.

After that, Helm clients can use:

```bash
helm repo add redisnavigator https://themkarimi.github.io/redisnavigator
helm repo update
```

## Uninstall

```bash
helm uninstall redis-navigator --namespace redis-navigator
```

## Useful Values

See [`values.yaml`](./values.yaml) for the full set of options. A few commonly changed keys:

| Key | Description |
| --- | --- |
| `backend.image.repository` | Backend container image |
| `backend.image.tag` | Backend image tag |
| `frontend.image.repository` | Frontend container image |
| `frontend.image.tag` | Frontend image tag |
| `backend.frontendUrl` | Public frontend URL used by the backend for CORS and redirects |
| `externalDatabase.*` | External PostgreSQL connection settings |
| `ingress.enabled` | Enable Kubernetes Ingress |
| `ingress.host` | Hostname used by the frontend and API |
| `oidc.enabled` | Enable OIDC / SSO |
| `configFile.enabled` | Mount a config-as-code YAML file into the backend |
| `disabledCommands` | Comma-separated Redis commands to block |

## Existing Secrets

You can avoid putting secrets directly in Helm values by referencing existing Kubernetes Secrets:

- `backend.existingSecret`: secret containing `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `ENCRYPTION_KEY`
- `externalDatabase.existingSecret`: secret containing `DATABASE_URL`
- `oidc.existingSecret`: secret containing `OIDC_CLIENT_SECRET`

That is usually the better fit for production clusters using an external secret manager.
