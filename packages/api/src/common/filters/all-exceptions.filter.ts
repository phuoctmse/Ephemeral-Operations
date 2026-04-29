import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let responseBody: Record<string, unknown> | null = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        !Array.isArray(exceptionResponse)
      ) {
        responseBody = {
          ...exceptionResponse,
          timestamp:
            (exceptionResponse as Record<string, unknown>).timestamp ??
            new Date().toISOString(),
        };
        message =
          (exceptionResponse as Record<string, unknown>)?.message?.toString() ??
          exception.message;
      } else {
        message =
          typeof exceptionResponse === 'string'
            ? exceptionResponse
            : exception.message;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    this.logger.error(
      `Exception [${status}]: ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json(
      responseBody ?? {
        statusCode: status,
        message,
        timestamp: new Date().toISOString(),
      },
    );
  }
}
