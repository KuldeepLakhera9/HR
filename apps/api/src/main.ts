import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // 1. Cookie Parser
  const parseCookies =
    typeof cookieParser === 'function'
      ? cookieParser
      : (cookieParser as unknown as { default: typeof cookieParser }).default || cookieParser;
  app.use(parseCookies());

  // 2. Global Prefix - /api/v1
  const apiPrefix = process.env.API_PREFIX || 'api/v1';
  app.setGlobalPrefix(apiPrefix);

  // 3. Global Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // 4. Global Filters & Interceptors
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  // 5. CORS
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : [
        'http://localhost:8080',
        'http://127.0.0.1:8080',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
      ];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // 5. Swagger / OpenAPI Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('PeopleOS HRMS API')
    .setDescription('Production-grade self-hosted Human Resource Management System REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Health', 'Application and database connectivity probes')
    .addTag('Auth', 'Authentication and session tokens')
    .addTag('Users', 'User accounts & profiles')
    .addTag('Roles', 'Role management')
    .addTag('Permissions', 'Granular system privileges')
    .addTag('Organization', 'Organization hierarchy, branches and departments')
    .addTag('Employees', 'Employee directory')
    .addTag('Attendance', 'Attendance tracking (Office / Official Visit / WFH)')
    .addTag('Official Visits', 'Outdoor duty and official travel workflows')
    .addTag('Leave', 'Leave balances and requests')
    .addTag('Reports', 'MIS and workforce analytics')
    .addTag('Documents', 'Organization policies and employee files')
    .addTag('Notifications', 'In-app notification dispatch')
    .addTag('Audit', 'Immutable enterprise audit logging')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'PeopleOS HRMS API Docs',
  });

  const port = process.env.PORT || 4000;
  await app.listen(port);

  logger.log(`🚀 HRMS Backend API running on: http://localhost:${port}/${apiPrefix}`);
  logger.log(`📚 Swagger Documentation available at: http://localhost:${port}/api/docs`);
  logger.log(`🩺 Health Endpoint available at: http://localhost:${port}/${apiPrefix}/health`);
}

bootstrap();
