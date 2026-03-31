import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status = exception instanceof HttpException 
      ? exception.getStatus() 
      : 500;

    const message = exception instanceof HttpException
      ? exception.getResponse()
      : 'Internal Server Error';

    this.logger.error(
      `Status: ${status} | Message: ${JSON.stringify(message)}`,
      exception instanceof Error ? exception.stack : String(exception)
    );

    response.status(status).json({
      statusCode: status,
      message: typeof message === 'string' ? message : (message as any).message || 'Unauthorized',
      timestamp: new Date().toISOString(),
    });
  }
}