# PeopleOS HRMS — Private Document Storage & Filesystem Vault

**Document ID:** `FILE-STORAGE-005`  
**Phase:** 17 — Production Data-Center Deployment, DevOps, Backups & Disaster Recovery  
**Target Environment:** Private Organizational Data Center  
**Classification:** Confidential — Internal Operational Standard

---

## 1. Document Vault Architecture Overview

PeopleOS HRMS handles sensitive employee identity verifications, educational certificates, tax declarations, and contracts. To prevent data leakage, unauthorized file exposure, or malicious code execution, file storage is managed through a **Strictly Isolated Local Filesystem Vault** governed by [`DocumentsService`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/modules/documents/documents.service.ts).

Private employee documents are **never exposed via static web directories** or public web servers. All file transfers occur through authenticated, authorized, and audit-logged streaming endpoints.

---

## 2. Storage Partitioning & Path Traversal Prevention

### 2.1 File System Hierarchy

Files are stored under the root directory defined by `SECURE_DOCUMENT_STORAGE_DIR` (defaulting to `/app/storage/documents` in containers and mapped to `/var/hrms/storage/documents` on the host SAN volume):

```
/var/hrms/storage/documents/
└── <organization_id>/
    └── <employee_id>/
        ├── 7c9e6679-7425-40de-944b-e07fc1f90ae7.bin
        └── 3b12a840-02c3-4e89-a218-5a432578fa12.bin
```

### 2.2 Canonical Path Resolution & Sandboxing

To defeat directory traversal attacks (`../` sequences), the service resolves absolute paths using POSIX canonical normalization:

```typescript
const root = path.resolve(this.storageRoot);
const resolvedPath = path.resolve(root, organizationId, employeeId, `${documentId}.bin`);

if (!resolvedPath.startsWith(root)) {
  throw new ForbiddenException('Path traversal attempt detected');
}
```

Files are stored with an opaque `.bin` extension. The original filename and metadata are stored separately in the PostgreSQL database table `employee_document_metadata`.

---

## 3. Upload Validation & Deep Magic-Byte Inspection

Files undergo rigorous in-memory inspection prior to disk persistence:

1. **Size Enforcement:** Maximum upload threshold is strictly capped at **10 MB** (10,485,760 bytes). Payloads exceeding this threshold are rejected immediately with `400 Bad Request`.
2. **Magic-Byte Signature Verification:**
   - **PDF:** File header must start with `%PDF-` (`0x25 0x50 0x44 0x46`).
   - **PNG:** File header must start with `\x89PNG\r\n\x1a\n` (`0x89 0x50 0x4E 0x47`).
   - **JPEG:** File header must start with `\xFF\xD8\xFF`.
   - **WebP:** File header must contain `RIFF` and `WEBP` magic bytes.
   - **DOCX:** ZIP archive signature `PK\x03\x04` (`0x50 0x4B 0x03 0x04`).
3. **Executable & Script Injection Blocking:**
   - Executable PE binaries (Windows `MZ` signature `0x4D 0x5A`) and Linux `ELF` binaries (`0x7F 0x45 0x4C 0x46`) are unconditionally rejected.
   - Script vectors containing `<html`, `<svg`, `<script`, or `<?php` in the first 512 bytes are blocked to prevent stored Cross-Site Scripting (XSS).

---

## 4. File System Permissions & Security Controls

| Scope                 | Requirement                     | Implementation                                                     | Security Benefit                                                                |
| :-------------------- | :------------------------------ | :----------------------------------------------------------------- | :------------------------------------------------------------------------------ |
| **File Mode**         | POSIX `0600` (`-rw-------`)     | `fs.promises.writeFile(path, buf, { mode: 0o600 })`                | Read/write strictly by the service process; inaccessible to other system users. |
| **Directory Mode**    | POSIX `0700` (`drwx------`)     | `fs.mkdirSync(dir, { recursive: true, mode: 0o700 })`              | Prevents directory listing or transversal by unprivileged users.                |
| **Process Ownership** | Non-root `node:node` (UID 1000) | Enforced in Dockerfile and host deployment                         | Process isolation. Compromise does not grant host root.                         |
| **Host Volume Mount** | Persistent Volume               | Docker volume `document_vault` mounted at `/app/storage/documents` | Files survive container restart and rebuild cycles.                             |

---

## 5. Streaming & Delivery Protocol

Files are delivered via authenticated HTTP streaming (`GET /documents/:id/download`):

1. **Ownership & Access Verification:**
   - Non-admin callers can only stream documents belonging to their own `employeeId`.
   - HR and Admin callers can stream documents belonging to employees in their organization.
2. **Anti-Caching Headers:**
   - `Cache-Control: no-store, no-cache, must-revalidate, private`
   - `Pragma: no-cache`
   - `Content-Disposition: attachment; filename="<sanitized_original_name>"`
3. **Payslip Handling:**
   - Payslip PDFs are generated in-memory via `PayslipPdfService` directly into a binary `Buffer`.
   - They are streamed directly over HTTP and are **never** written to unencrypted temporary files on disk.

---

## 6. Document Vault Backup & Capacity Monitoring

### 6.1 Daily Synchronized File Backup

Document files must be backed up synchronously with database snapshots to ensure consistency between database metadata IDs and disk `.bin` files:

```bash
# Backup document vault using tar with gzip compression:
tar -czf /var/backups/hrms/documents/hrms_docs_$(date +"%Y%m%d_%H%M%S").tar.gz \
  -C /var/hrms/storage documents/

# Generate SHA-256 integrity checksum:
sha256sum /var/backups/hrms/documents/hrms_docs_*.tar.gz > \
  /var/backups/hrms/documents/hrms_docs_$(date +"%Y%m%d_%H%M%S").tar.gz.sha256
```

### 6.2 Capacity Monitoring Alert Thresholds

- **Warning Alert:** Triggered at 75% capacity of `/var/hrms/storage`.
- **Critical Alert:** Triggered at 90% capacity of `/var/hrms/storage`.
- Monitored via Prometheus `node_exporter` filesystem collector.
