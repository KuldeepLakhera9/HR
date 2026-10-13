# PeopleOS HRMS — Environment & Secrets Configuration Guide

**Document ID:** `ENV-CONF-003`  
**Phase:** 17 — Production Data-Center Deployment, DevOps, Backups & Disaster Recovery  
**Target Environment:** Private Organizational Data Center  
**Classification:** Confidential — Internal Operational Standard

---

## 1. Overview & Policy Principles

To maintain strict operational hygiene and prevent credential leakage across environments, PeopleOS enforces four mandatory environment tiers:

1. **Local Development (`development`):** Local developer machines using non-sensitive developer credentials.
2. **Automated Testing (`test`):** In-memory and ephemeral test runs executed during CI/CD.
3. **Pre-Production Staging (`staging`):** Dedicated staging VM mirroring data-center network and security controls.
4. **Production Data Center (`production`):** Hardened, isolated deployment with zero default credentials.

### Zero Insecure Defaults Principle

In `production` mode, the application **fails immediately at boot** if critical cryptographic tokens, database credentials, or CORS origins are missing or contain development placeholder strings.

---

## 2. Environment Variable Master Matrix

| Variable Name                 | Required In Prod? | Is Secret? | Target Service    | Default / Fallback                 | Description & Security Purpose                                                     |
| :---------------------------- | :---------------: | :--------: | :---------------- | :--------------------------------- | :--------------------------------------------------------------------------------- |
| `NODE_ENV`                    |      **Yes**      |     No     | `api`, `web`      | `production`                       | Dictates runtime mode, enables production optimizations, disables debug stacks.    |
| `POSTGRES_USER`               |      **Yes**      |     No     | `postgres`, `api` | None                               | Dedicated application database user (must not be `postgres` superuser).            |
| `POSTGRES_PASSWORD`           |      **Yes**      |  **Yes**   | `postgres`, `api` | None (Fails if empty)              | Strong password for PostgreSQL authentication. Minimum 24 characters.              |
| `POSTGRES_DB`                 |      **Yes**      |     No     | `postgres`, `api` | `hrms_production_db`               | Primary database name.                                                             |
| `DATABASE_URL`                |      **Yes**      |  **Yes**   | `api`             | Constructed in Compose             | Full PostgreSQL connection URI including authentication and schema parameters.     |
| `DATABASE_POOL_SIZE`          |        No         |     No     | `api`             | `50`                               | Maximum connection pool size allocated by Prisma to prevent PostgreSQL exhaustion. |
| `JWT_SECRET`                  |      **Yes**      |  **Yes**   | `api`             | None (Fails if empty)              | 256-bit cryptographic secret for signing short-lived access tokens (HMAC-SHA256).  |
| `JWT_EXPIRATION`              |        No         |     No     | `api`             | `15m`                              | Lifetime of user access tokens.                                                    |
| `JWT_REFRESH_SECRET`          |      **Yes**      |  **Yes**   | `api`             | None (Fails if empty)              | 256-bit cryptographic secret for signing long-lived refresh tokens.                |
| `JWT_REFRESH_EXPIRATION`      |        No         |     No     | `api`             | `7d`                               | Lifetime of refresh tokens stored in secure `httpOnly` cookies.                    |
| `CORS_ORIGIN`                 |      **Yes**      |     No     | `api`             | None (Fails if empty)              | Comma-separated whitelist of approved corporate FQDNs allowed to make API calls.   |
| `API_PREFIX`                  |        No         |     No     | `api`             | `api/v1`                           | URL prefix routing for API endpoints.                                              |
| `PORT`                        |        No         |     No     | `api`, `web`      | `4000` (API) / `3000` (Web)        | Internal TCP listening ports within container/host.                                |
| `NEXT_PUBLIC_API_URL`         |      **Yes**      |     No     | `web`             | `/api/v1`                          | Relative API path proxy for browser client calls via Nginx.                        |
| `NEXT_PUBLIC_APP_NAME`        |        No         |     No     | `web`             | `PeopleOS HRMS`                    | User-facing portal header brand name.                                              |
| `NEXT_PUBLIC_APP_ENV`         |        No         |     No     | `web`             | `production`                       | Client environment badge indicator.                                                |
| `NEXT_TELEMETRY_DISABLED`     |      **Yes**      |     No     | `web`             | `1`                                | Disables Next.js anonymous usage telemetry, ensuring data-center privacy.          |
| `SECURE_DOCUMENT_STORAGE_DIR` |      **Yes**      |     No     | `api`             | `/app/storage/documents`           | Persistent filesystem path for private employee document vault.                    |
| `ENABLE_SWAGGER`              |        No         |     No     | `api`             | `false`                            | Controls mounting of Swagger UI at `/api/docs`. Strictly `false` in production.    |
| `MAIL_DRIVER`                 |        No         |     No     | `api`             | `smtp`                             | Mail transport driver: `smtp` for live mail, `console` for offline staging.        |
| `SMTP_HOST`                   |    Conditional    |     No     | `api`             | `mailrelay.internal.corp`          | Internal corporate mail relay hostname.                                            |
| `SMTP_PORT`                   |    Conditional    |     No     | `api`             | `587`                              | Corporate mail relay port (typically 25, 465, or 587).                             |
| `SMTP_USER`                   |    Conditional    |  **Yes**   | `api`             | Optional                           | SMTP authentication username (if required by relay).                               |
| `SMTP_PASS`                   |    Conditional    |  **Yes**   | `api`             | Optional                           | SMTP authentication password.                                                      |
| `SMTP_FROM`                   |    Conditional    |     No     | `api`             | `notifications@hrms.internal.corp` | From address header for automated notification emails.                             |
| `BACKUP_RETENTION_DAYS`       |        No         |     No     | Backup scripts    | `14`                               | Number of days automated database snapshots are retained on disk before pruning.   |

---

## 3. Cryptographic Secret Generation Procedures

All production cryptographic keys and passwords must be generated using cryptographically secure pseudo-random number generators (CSPRNG):

```bash
# 1. Generate 256-bit high-entropy secret for JWT Access Tokens
openssl rand -base64 32

# 2. Generate 256-bit high-entropy secret for JWT Refresh Tokens
openssl rand -base64 32

# 3. Generate robust PostgreSQL password (minimum 24 characters)
openssl rand -base64 24

# 4. Generate random administrative session secret (if required)
openssl rand -hex 32
```

---

## 4. File Permissions & Secret Storage on Host

Production `.env` files must **never** be checked into Git repositories, mirrored to public storage, or left readable by unprivileged system users:

```bash
# Set strict ownership and permissions on the production environment file:
sudo chown root:root /etc/hrms/.env.production
sudo chmod 600 /etc/hrms/.env.production

# Or if managed by dedicated service account 'hrms-deployer':
sudo chown hrms-deployer:hrms-deployer /opt/hrms/.env.production
sudo chmod 600 /opt/hrms/.env.production
```

---

## 5. Secret Rotation Policies

| Secret Type              | Recommended Rotation Frequency | Rotation Procedure                                                                                                                                 | Service Impact                                              |
| :----------------------- | :----------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------- |
| **`POSTGRES_PASSWORD`**  |         Every 90 days          | 1. Update password in PostgreSQL using `ALTER USER ... WITH PASSWORD`.<br>2. Update `.env.production`.<br>3. Rolling restart of API containers.    | Zero downtime if coordinated with connection pool drainage. |
| **`JWT_SECRET`**         |         Every 180 days         | 1. Update `JWT_SECRET` in `.env.production`.<br>2. Restart API.<br>Active 15-minute access tokens will expire and be refreshed via refresh tokens. | Users maintain sessions via refresh token without relogin.  |
| **`JWT_REFRESH_SECRET`** |    Annually or upon breach     | 1. Update `JWT_REFRESH_SECRET` in `.env.production`.<br>2. Restart API.<br>All active refresh tokens become invalid.                               | All users required to authenticate anew via login page.     |
| **TLS Certificates**     |  Annually (or before expiry)   | 1. Place renewed certificate in `/etc/nginx/certs/fullchain.pem`.<br>2. Reload Nginx (`nginx -s reload`).                                          | Zero downtime.                                              |

---

## 6. Log Scrubbing & Information Leakage Prevention

The application logging layer (`LoggingInterceptor`, `AllExceptionsFilter`, and `Logger`) enforces strict data masking:

1. **Suppressed Request Bodies:** Endpoints matching `/auth/login`, `/auth/reset-password`, `/payroll/salary-structures`, and `/users/change-password` have their request bodies stripped from logs.
2. **Authorization Header Masking:** HTTP `Authorization: Bearer <token>` and `Cookie` headers are sanitized to `[REDACTED]`.
3. **PII and Financial Redaction:** Plaintext bank account numbers, PAN numbers, and individual salary figures are excluded from stdout.
4. **Database Connection Strings:** The `DATABASE_URL` is parsed by Prisma without exposing the password in console outputs.
