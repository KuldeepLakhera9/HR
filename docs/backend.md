# PeopleOS HRMS — Backend Architecture

## 1. Technology Stack

- **Framework**: NestJS 10
- **Language**: TypeScript (Strict Mode)
- **API Protocol**: REST API with OpenAPI/Swagger
- **Database Client**: Prisma ORM with `@hrms/database`
- **Validation**: class-validator & class-transformer

## 2. API Prefix & Standards

All endpoints are hosted under:

```
/api/v1/...
```

Swagger UI documentation is available at:

```
http://localhost:4000/api/docs
```

## 3. Standard Response Envelope

All API responses follow a consistent envelope:

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {},
  "meta": {}
}
```

Error responses:

```json
{
  "success": false,
  "statusCode": 404,
  "message": "Resource not found",
  "errors": null,
  "timestamp": "2026-10-08T11:00:00.000Z",
  "path": "/api/v1/employees/999"
}
```

## 4. Module Boundaries (Phase 1)

1. `health`: Database ping and service status probes (`/api/v1/health`)
2. `auth`: Token issuance & user profile
3. `users`: Identity accounts
4. `roles`: Role definitions (ADMIN, HR, MANAGER, EMPLOYEE)
5. `permissions`: Granular capability catalog
6. `organization`: Branch and department structures
7. `employees`: Staff master directory
8. `attendance`: Check-in logging and mode policies
9. `visits`: Outdoor duty official travel
10. `leave`: Leave policies and balances
11. `reports`: MIS report generators
12. `documents`: File policies and guidelines
13. `notifications`: Notification inbox
14. `audit`: Immutable audit trail
