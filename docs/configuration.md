# PeopleOS HRMS — Configuration Reference

**Document ID:** `TECH-CONF-002`  
**Phase:** 18 — Final HRMS UAT, Documentation, Release Validation & Sign-Off  
**Target Audience:** DevOps Engineers, Database Administrators & Systems Engineers

---

## 1. Configuration Overview

PeopleOS HRMS utilizes standard environment variables loaded via NestJS `ConfigModule` and Next.js runtime environment parameters. In production mode, fallback to insecure development defaults is strictly disallowed, and the application will fail safely at startup if required cryptographic keys or database credentials are missing.

---

## 2. Environment Variables Master Reference

| Variable Name                 | Environment |  Required   | Default Value                      | Description                                                            |
| :---------------------------- | :---------: | :---------: | :--------------------------------- | :--------------------------------------------------------------------- |
| `NODE_ENV`                    |     All     |     Yes     | `development` / `production`       | Dictates application runtime mode and optimizations.                   |
| `PORT`                        |     API     |     No      | `4000`                             | Internal HTTP listening port for backend API service.                  |
| `API_PREFIX`                  |     API     |     No      | `api/v1`                           | URL routing prefix for all REST endpoints.                             |
| `DATABASE_URL`                |     API     |     Yes     | None                               | Full PostgreSQL connection URI with credentials and schema.            |
| `DATABASE_POOL_SIZE`          |     API     |     No      | `50`                               | Maximum connection pool size allocated by Prisma client.               |
| `JWT_SECRET`                  |     API     |     Yes     | None                               | 256-bit cryptographic secret for signing access tokens (min 32 chars). |
| `JWT_EXPIRATION`              |     API     |     No      | `15m`                              | Access token lifespan.                                                 |
| `JWT_REFRESH_SECRET`          |     API     |     Yes     | None                               | 256-bit cryptographic secret for signing refresh tokens.               |
| `JWT_REFRESH_EXPIRATION`      |     API     |     No      | `7d`                               | Refresh token lifespan.                                                |
| `CORS_ORIGIN`                 |     API     |     Yes     | None in Prod                       | Whitelist of corporate FQDNs allowed to make API requests.             |
| `SECURE_DOCUMENT_STORAGE_DIR` |     API     |     Yes     | `/app/storage/documents`           | Persistent filesystem path for private employee document vault.        |
| `ENABLE_SWAGGER`              |     API     |     No      | `false` in Prod                    | Controls Swagger UI mounting at `/api/docs`.                           |
| `MAIL_DRIVER`                 |     API     |     No      | `smtp` / `console`                 | Email delivery transport driver (`smtp` or `console`).                 |
| `SMTP_HOST`                   |     API     | Conditional | `mailrelay.internal.corp`          | Corporate SMTP mail relay server hostname.                             |
| `SMTP_PORT`                   |     API     | Conditional | `587`                              | Corporate SMTP mail relay port.                                        |
| `SMTP_USER`                   |     API     | Conditional | None                               | SMTP authentication username.                                          |
| `SMTP_PASS`                   |     API     | Conditional | None                               | SMTP authentication password.                                          |
| `SMTP_FROM`                   |     API     | Conditional | `notifications@hrms.internal.corp` | Sender address header for notification emails.                         |
| `NEXT_PUBLIC_API_URL`         |     Web     |     Yes     | `/api/v1`                          | API proxy route consumed by client-side browser code.                  |
| `NEXT_PUBLIC_APP_NAME`        |     Web     |     No      | `PeopleOS HRMS`                    | User-facing brand title in web portal header.                          |
| `NEXT_PUBLIC_APP_ENV`         |     Web     |     No      | `production`                       | Environment badge indicator shown in web shell.                        |
| `NEXT_TELEMETRY_DISABLED`     |     Web     |     Yes     | `1`                                | Disables anonymous Next.js telemetry collection.                       |

---

## 3. Secret Generation Standards

All production cryptographic tokens and database passwords must be generated using cryptographically secure pseudo-random number generators:

```bash
# JWT Access Token Secret (256-bit CSPRNG)
openssl rand -base64 32

# JWT Refresh Token Secret (256-bit CSPRNG)
openssl rand -base64 32

# PostgreSQL Password (Minimum 24 characters)
openssl rand -base64 24
```
