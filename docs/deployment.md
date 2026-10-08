# PeopleOS HRMS — Datacenter Self-Hosted Deployment Guide

## 1. Deployment Topology

The entire PeopleOS stack is packaged into Docker Compose containers for self-hosted datacenter operation:

- `hrms_postgres`: PostgreSQL 16 on internal bridge network
- `hrms_api`: NestJS API container (:4000)
- `hrms_web`: Next.js Web Frontend (:3000)
- `hrms_nginx`: Nginx reverse proxy exposed on port 80/443

## 2. Docker Compose Deployment

1. Ensure environment variables are configured in `.env`:

   ```bash
   NODE_ENV=production
   POSTGRES_USER=hrms_admin
   POSTGRES_PASSWORD=secure_generated_password
   POSTGRES_DB=hrms_production
   PORT=4000
   API_PREFIX=api/v1
   ```

2. Build and launch all containers:

   ```bash
   docker compose up -d --build
   ```

3. Verify service health:

   ```bash
   docker compose ps
   curl http://localhost/api/v1/health
   ```

4. Database Migrations in Container:
   ```bash
   docker compose exec api npx prisma db push
   docker compose exec api npx ts-node packages/database/prisma/seed.ts
   ```
