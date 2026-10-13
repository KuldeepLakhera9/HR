# PeopleOS HRMS — Network Access Control (NAC) & TLS Readiness

**Document ID:** `NET-REQ-009`  
**Phase:** 17 — Production Data-Center Deployment, DevOps, Backups & Disaster Recovery  
**Target Environment:** Private Organizational Data Center with Corporate NAC  
**Classification:** Confidential — Internal Operational Standard

---

## 1. Network Access Control (NAC) Context & Boundaries

Our corporate data center enforces strict 802.1X Network Access Control (NAC) to protect internal systems. Under NAC rules, unmanaged devices, unauthorized subnets, and non-registered network ports are quarantined by default.

PeopleOS HRMS is engineered to operate seamlessly within this environment by establishing clear network zoning, deterministic port requirements, and complete TLS termination without bypassing organizational security policies.

---

## 2. Ingress & Inbound Network Specifications

| Parameter                     | Specification                                 | Responsibility               |     Approval Status     |
| :---------------------------- | :-------------------------------------------- | :--------------------------- | :---------------------: |
| **Production FQDN**           | `https://hrms.internal.corp`                  | Network / DNS Admin          | Pending Form Submission |
| **Staging FQDN**              | `https://hrms-staging.internal.corp`          | Network / DNS Admin          | Pending Form Submission |
| **Ingress VIP / Entry Point** | Internal Enterprise Load Balancer / Proxy     | Network Operations Team      |   Pending Allocation    |
| **Permitted Inbound Port**    | **TCP 443 (HTTPS)**                           | Firewall / Network Team      |    Approved Pattern     |
| **HTTP Port 80 Behavior**     | HTTP 301 Permanent Redirect to HTTPS 443      | `hrms_nginx` / Ingress Proxy |        Standard         |
| **Source Networks**           | Authorized corporate user subnets & VPN pools | NAC Policy Engine            |        Required         |

---

## 3. Firewall & Inter-VLAN Routing Matrix

The table below defines the formal network firewall rules required for data-center deployment:

```
[ Corporate Endpoints ] ---> (TCP 443) ---> [ Ingress VIP / Proxy (VLAN 310) ]
[ Ingress VIP / Proxy ] ---> (TCP 80/443) -> [ HRMS App VM (VLAN 320) ]
[ HRMS App VM ] ----------> (TCP 5432) ---> [ PostgreSQL VM (VLAN 330) ]
[ HRMS App VM ] ----------> (TCP 25/587) --> [ Corporate SMTP Relay (VLAN 200) ]
[ Prometheus Server ] ----> (TCP 4000) ---> [ HRMS App VM (/api/v1/health) ]
```

### Detailed Rules:

1. **Rule HRMS-IN-01:** Allow TCP 443 from Corporate Workstations (`10.100.0.0/16`) and VPN Subnet (`10.200.0.0/18`) to Ingress VIP (`10.50.10.15`).
2. **Rule HRMS-APP-02:** Allow TCP 80/443 from Ingress VIP (`10.50.10.15`) to HRMS Application VM (`10.50.20.25`).
3. **Rule HRMS-DB-03:** Allow TCP 5432 from HRMS Application VM (`10.50.20.25`) to Database VM (`10.50.30.35`). **DENY ALL OTHER SOURCES.**
4. **Rule HRMS-OUT-04:** Allow TCP 587 from HRMS Application VM (`10.50.20.25`) to Corporate Mail Relay (`10.10.5.10`).
5. **Rule HRMS-MON-05:** Allow TCP 4000 from Monitoring Cluster (`10.50.40.0/24`) to HRMS Application VM (`10.50.20.25`) for Prometheus health scraping.

---

## 4. TLS & Certificate Management

### 4.1 Internal PKI Certificates

Because the application is hosted internally, public certificate authorities (e.g., Let's Encrypt) cannot perform HTTP/DNS ACME validation against internal hostnames.

- Certificates must be issued by the **Corporate Enterprise Root Certificate Authority (PKI)**.
- The certificate must include:
  - Common Name (CN): `hrms.internal.corp`
  - Subject Alternative Name (SAN): `DNS:hrms.internal.corp, DNS:hrms.corp.local, IP:10.50.10.15`
  - Signature Algorithm: SHA-256 with RSA 4096-bit or ECDSA P-384.

### 4.2 Nginx TLS Protocol Hardening

In [`infrastructure/nginx/nginx.prod.conf`](file:///c:/Kuldeep's%20Work/Projects/HR/infrastructure/nginx/nginx.prod.conf), TLS protocols and cipher suites are restricted to modern, secure standards:

- **Protocols Permitted:** TLSv1.2, TLSv1.3 only (SSLv3, TLS 1.0, TLS 1.1 disabled).
- **HSTS:** `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- **Reverse Proxy Headers:** Upstream proxy forwards `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Forwarded-Port` so that NestJS and Next.js can accurately detect client IP addresses and enforce secure cookies.

---

## 5. NAC Device Compliance & Cookie Security

1. **Secure Cookies:**
   - `refreshToken` cookies attach `Secure; HttpOnly; SameSite=Lax; Path=/api/v1/auth`.
   - In production, browser clients will strictly refuse to send tokens over unencrypted HTTP.
2. **Device Identification:**
   - Client IP addresses and `User-Agent` strings are captured during login and recorded in `auth_sessions`.
   - Rapid IP subnet hopping triggers audit warnings and session re-verification.
