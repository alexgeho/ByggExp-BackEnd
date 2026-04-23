import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './filtres/exception.filter';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const uploadsDir = join(process.cwd(), 'uploads', 'project-documents');
  const taskUploadsDir = join(process.cwd(), 'uploads', 'task-documents');

  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }

  if (!existsSync(taskUploadsDir)) {
    mkdirSync(taskUploadsDir, { recursive: true });
  }

  const logger = new Logger('Bootstrap');
  app.useLogger(logger);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  app.use((req, res, next) => {
    logger.log(`${req.method} ${req.url}`);
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, 
      whitelist: true, 
    })
  );
  
  app.enableCors({
    origin: [
      'http://localhost:5173', 
      'http://localhost:5174',
      'https://bygghub.nu',    
      'https://www.bygghub.nu',
      'https://tot-bygghub-admin-site.vercel.app',
      'http://localhost:8081'
    ],
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Server started on port ${port}`);
}
bootstrap();