# PeopleOS HRMS — Monitoring, Logging & Alerting Operations

**Document ID:** `MON-LOG-008`  
**Phase:** 17 — Production Data-Center Deployment, DevOps, Backups & Disaster Recovery  
**Target Environment:** Private Organizational Data Center  
**Classification:** Confidential — Internal Operational Standard

---

## 1. Observability Architecture Overview

The PeopleOS HRMS observability architecture provides deep visibility into service health, database connection usage, API latency, background payroll jobs, and security anomalies without exposing sensitive employee PII or financial calculations.

The platform is designed to integrate cleanly with enterprise data-center monitoring stacks (e.g., Prometheus + Alertmanager, Grafana, Zabbix, or ELK/OpenSearch).

---

## 2. Health & Readiness Probes

### 2.1 Health Check Endpoint (`/api/v1/health`)

Mounted in `HealthController` as a public, unauthenticated probe endpoint for load balancers and container orchestrators:

```json
{
  "message": "System health check completed",
  "data": {
    "status": "ok",
    "timestamp": "2026-10-13T12:00:00.000Z",
    "version": "1.0.0",
    "uptime": 86420.5,
    "environment": "production",
    "services": {
      "database": {
        "status": "connected",
        "latencyMs": 1.45
      },
      "api": {
        "status": "healthy"
      }
    }
  }
}
```

### 2.2 Security of the Health Probe

- **Zero Information Leakage:** Does not expose connection strings, database usernames, hostnames, or memory dumps.
- **Fail-Safe Response Codes:** If PostgreSQL connectivity fails (`SELECT 1` times out), the endpoint returns `status: "degraded"` with appropriate HTTP status codes, enabling automatic upstream circuit breaking and load-balancer traffic diversion.

---

## 3. Metric Indicators & Alerting Matrix

Alert rules are defined in [`infrastructure/monitoring/alert-rules.yml`](file:///c:/Kuldeep's%20Work/Projects/HR/infrastructure/monitoring/alert-rules.yml):

| Alert Name                         | Metric / Expression                  | Threshold / Duration |   Severity   | Action & Playbook                                                                                                          |
| :--------------------------------- | :----------------------------------- | :------------------: | :----------: | :------------------------------------------------------------------------------------------------------------------------- |
| **`HrmsServiceUnhealthy`**         | `up == 0`                            |        1 min         | **Critical** | Service down. Check container logs (`docker compose logs api`), verify system resources, restart failed service.           |
| **`PayrollApiHigh5xxRate`**        | `rate(5xx[5m]) / rate(total[5m])`    |    > 2% for 2 min    | **Critical** | Check API error traces, database connection pool, and upstream gateway connectivity.                                       |
| **`PostgresConnectionSaturation`** | `pg_stat_activity / max_connections` |   > 80% for 3 min    | **Warning**  | Investigate long-running queries; consider increasing `DATABASE_POOL_SIZE` or tuning client query concurrency.             |
| **`PayrollCalculationJobFailure`** | `increase(calc_failures[5m])`        |    > 0 for 1 min     | **Critical** | Orchestration failure. Inspect `calculationLog` in `payroll_runs` table, correct data anomaly, invoke safe retry endpoint. |
| **`DiskSpaceRunningLow`**          | `node_filesystem_free_bytes / size`  |   < 15% for 5 min    | **Warning**  | Prune aged log files, verify backup retention script executed, expand persistent volume.                                   |
| **`TlsCertificateExpiringSoon`**   | Certificate validity days            |      < 14 days       | **Warning**  | Renew corporate internal X.509 certificate and reload Nginx.                                                               |

---

## 4. Structured Logging Standards & Rotation

### 4.1 JSON Log Structure

All production logs produced by NestJS and Nginx are formatted as structured JSON with ISO-8601 timestamps and severity levels:

```json
{
  "timestamp": "2026-10-13T12:00:00.123Z",
  "level": "INFO",
  "context": "PayrollRunsService",
  "message": "Calculated payroll for run pr-10 (450 employees in 24ms)",
  "organizationId": "org-core-01",
  "userId": "usr-admin-01"
}
```

### 4.2 Data Sanitization & Scrubbing Rules

To ensure compliance with data privacy mandates, the logging interceptor strictly suppresses:

- Passwords, hashes, and authentication tokens (`Authorization: Bearer ...`).
- Session cookies (`refreshToken=...`).
- Plaintext Bank Account numbers and Permanent Account Numbers (PAN).
- Individual employee compensation values and deductions.

### 4.3 Container Log Rotation

Docker Compose enforces disk protection limits on all service containers:

```yaml
logging:
  driver: 'json-file'
  options:
    max-size: '50m'
    max-file: '5'
```

This guarantees container logs never exceed 250 MB per service, eliminating disk exhaustion risks.
