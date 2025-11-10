## Additional Deployment Guideline: New Environments for GIM Integration + S3

Refer to the base deployment guide first, then apply the additional steps below for GIM and S3.

- Base guide: [README.md](../helm/sim/README.md)

### Scope
- Configure a new environment that integrates with GIM Console.
- Enable embed session enforcement for workspace-scoped access.
- Configure AWS S3 for storage (files, knowledge base, chat assets, etc.).

### Prerequisites
- Public domain and TLS (HTTPS) for the app URL.
- PostgreSQL database reachable by the app.
- Redis available for caching/queues if used.
- Credentials for AWS IAM (for S3 access) if using S3.

### Core environment variables
Set these in your deployment (Kubernetes/Helm, Docker, or host env). Values shown are examples:

```env
# Core networking/runtime
NEXT_PUBLIC_APP_URL=your_domain_for_sim_app # Eg: https://app.dev.sim.beango.com
BETTER_AUTH_URL=your_domain_for_sim_app # (Same as NEXT_PUBLIC_APP_URL)
NEXT_PUBLIC_SOCKET_URL=your_domain_for_sim_socket_server # Eg: https://socket-server.dev.sim.beango.com
ALLOWED_ORIGINS=gim_console_url # Eg: https://console.dev.gim.beango.com

# Auth and security
BETTER_AUTH_SECRET=your-64-char-random
ENCRYPTION_KEY=your-64-char-random
INTERNAL_API_SECRET=your-64-char-random

# Sessions and caching
REDIS_URL=redis://redis:6379

# Embed session for GIM embedded usage
EMBED_SESSION_ENABLED=true

# Hide features
NEXT_PUBLIC_HIDDEN_EXTRA_FEATURE=true
```

Notes:
- ALLOWED_ORIGINS should include GIM Console origin so the browser can call SIM safely.
- EMBED_SESSION_ENABLED must be true to enforce the embed workspace scoping in middleware.

### S3 configuration (AWS)
Set the following variables to enable S3-backed storage. At minimum, set region, credentials, and `S3_BUCKET_NAME`.

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=.../...

# General bucket (minimum)
S3_BUCKET_NAME=sim-app-general

# Optional specialized buckets (override per feature if desired)
S3_LOGS_BUCKET_NAME=sim-app-logs
S3_KB_BUCKET_NAME=sim-app-kb
S3_EXECUTION_FILES_BUCKET_NAME=sim-app-exec
```

### Kubernetes (Helm) example
Extend your values file to pass env vars into the app container. See the chart under `helm/sim`. This snippet focuses on app env only.

```yaml
app:
  env:
    NEXT_PUBLIC_APP_URL: "https://app.dev.sim.beango.com"
    BETTER_AUTH_URL: "https://app.dev.sim.beango.com"
    NEXT_PUBLIC_SOCKET_URL: "https://socket-server.dev.sim.beango.com"
    ALLOWED_ORIGINS: "https://console.dev.gim.beango.com"

    BETTER_AUTH_SECRET: "6f7a58af8631a24547591e52772594f28f3a95e2792a216131c468458de52435" # Use openssl rand -hex 32 to generate
    ENCRYPTION_KEY: "f31275246d730cef4d1a67d213409be5fb57291995f13a580cd02e5494dc847d" # Use openssl rand -hex 32 to generate, used to encrypt environment variables
    INTERNAL_API_SECRET: "79baf17f95effed90d8fca9681e7a04ebebbdee0ee52a7a98ac9576b60983142" # Use openssl rand -hex 32 to generate, used to encrypt internal api routes

    REDIS_URL: "redis://redis:6379"


    EMBED_SESSION_ENABLED: "true"

    # Hide features
    NEXT_PUBLIC_HIDDEN_EXTRA_FEATURE=true

    AWS_REGION: "us-east-1"
    AWS_ACCESS_KEY_ID: "${AWS_ACCESS_KEY_ID}"
    AWS_SECRET_ACCESS_KEY: "${AWS_SECRET_ACCESS_KEY}"
    S3_BUCKET_NAME: "sim-app-general"
    # Optionally override per feature
    # S3_KB_BUCKET_NAME: "sim-app-kb"
    # S3_EXECUTION_FILES_BUCKET_NAME: "sim-app-exec"
    # S3_LOGS_BUCKET_NAME: "sim-app-logs"
```

Best practices:
- Keep secrets (e.g., access keys) in Kubernetes Secrets and reference them via envFrom or value templating.
- Ensure ingress TLS is enabled for production.

### Verification checklist
- App loads at `NEXT_PUBLIC_APP_URL` over HTTPS.
- Super admin can sign in with configured credentials (bootstrap only).
- GIM Console origin is allowed and can embed/use SIM without CORS errors.
- File upload/download works against S3; objects appear in the configured bucket(s).

### Troubleshooting
- CORS errors from the browser: verify `ALLOWED_ORIGINS` and S3 bucket CORS allow both the app and GIM origins.
- Access denied to S3: check IAM policy scope and bucket names; confirm region and credentials.
- Embed session not enforced: confirm `EMBED_SESSION_ENABLED=true` and embed cookie is present.


### Docker build quick reference

```bash
# set once
ORG=simstudioai
VERSION=v1.0.0

# build images
docker build -f docker/app.Dockerfile -t $ORG/sim:$VERSION .
docker build -f docker/realtime.Dockerfile -t $ORG/realtime:$VERSION .
docker build -f docker/db.Dockerfile -t $ORG/migrations:$VERSION .

# optional: push
docker push $ORG/sim:$VERSION
docker push $ORG/realtime:$VERSION
docker push $ORG/migrations:$VERSION
```

Notes:
- For the app image, you may add build args if needed: `--build-arg DATABASE_URL=... --build-arg NEXT_PUBLIC_APP_URL=...`.


