import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { CloudifyError } from '@cloudify/common';
import { CORRELATION_ID_HEADER } from './correlation-id.middleware';

/**
 * Global exception filter — converts all errors to a consistent JSON format.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = request.headers[CORRELATION_ID_HEADER] as string;

    let statusCode: number;
    let errorCode: string;
    let message: string;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof CloudifyError) {
      statusCode = exception.statusCode;
      errorCode = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        errorCode = 'ERR_HTTP';
      } else {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || exception.message;
        errorCode = (resp.error as string) || 'ERR_HTTP';
        // class-validator errors come as array in message
        if (Array.isArray(resp.message)) {
          details = { validationErrors: resp.message };
          message = 'Validation failed';
          errorCode = 'ERR_VALIDATION';
        }
      }
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = 'ERR_INTERNAL';
      message = 'Internal server error';

      // Log the full error for non-operational errors
      this.logger.error(
        `Unhandled exception: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body = {
      error: errorCode,
      message,
      statusCode,
      ...(details ? { details } : {}),
      correlationId,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(statusCode).json(body);
  }
}
