import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Inject, Logger } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { auditLogs } from '../database/schema';
import { CORRELATION_ID_HEADER } from './correlation-id.middleware';

/**
 * Interceptor that logs all mutating API requests to the audit_logs table.
 * Applied globally on POST/PUT/PATCH/DELETE.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuditLog');

  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    // Only audit mutating operations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      return next.handle();
    }

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: (responseBody) => {
          this.logAudit(request, responseBody, startTime).catch((err) => {
            this.logger.warn(`Failed to write audit log: ${err.message}`);
          });
        },
        error: () => {
          // We don't audit failed requests (they're logged by the exception filter)
        },
      }),
    );
  }

  private async logAudit(request: Request, responseBody: unknown, _startTime: number) {
    const user = (request as unknown as Record<string, unknown>).user as
      | { userId: string; tenantId: string; role: string }
      | undefined;

    if (!user?.tenantId) return; // Skip unauthenticated requests

    const action = this.mapMethodToAction(request.method);
    if (!action) return;

    const correlationId = request.headers[CORRELATION_ID_HEADER] as string;
    const ipAddress = request.ip || request.socket.remoteAddress || 'unknown';

    // Try to extract resource ID from the URL (e.g., /api/v1/tenants/:id)
    const urlParts = request.originalUrl.split('/').filter(Boolean);
    const resourceId = this.extractUuid(urlParts);

    await this.db.insert(auditLogs).values({
      tenantId: user.tenantId,
      userId: user.userId,
      action,
      resourceId,
      diff: {
        method: request.method,
        path: request.originalUrl,
        body: this.sanitizeBody(request.body),
      },
      ipAddress,
      correlationId,
    });
  }

  private mapMethodToAction(method: string): 'create' | 'update' | 'delete' | null {
    switch (method) {
      case 'POST':
        return 'create';
      case 'PUT':
      case 'PATCH':
        return 'update';
      case 'DELETE':
        return 'delete';
      default:
        return null;
    }
  }

  private extractUuid(parts: string[]): string | undefined {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return parts.find((p) => uuidRegex.test(p));
  }

  private sanitizeBody(body: Record<string, unknown>): Record<string, unknown> {
    if (!body || typeof body !== 'object') return {};

    const sanitized = { ...body };
    const sensitiveFields = ['password', 'ownerPassword', 'secret', 'token', 'refreshToken', 'apiKey'];
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }
    return sanitized;
  }
}
