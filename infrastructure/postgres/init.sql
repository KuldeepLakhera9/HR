-- Initial PostgreSQL Extensions and Schemas for HRMS Platform
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE hrms_db TO hrms_user;
