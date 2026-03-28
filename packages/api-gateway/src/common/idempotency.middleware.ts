import { Injectable, NestMiddleware, Inject } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { eq, and, gt } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { idempotencyKeys } from '../database/schema';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const TTL_HOURS = 24;

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Only apply to mutating methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.headers[IDEMPOTENCY_KEY_HEADER] as string | undefined;
    if (!idempotencyKey) {
      return next();
    }

    // Extract tenant ID from JWT user (set by auth guard)
    const user = (req as unknown as Record<string, unknown>).user as
      | { tenantId: string }
      | undefined;
    const tenantId = user?.tenantId;
    if (!tenantId) {
      return next();
    }

    // Check for existing response
    const [existing] = await this.db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.tenantId, tenantId),
          eq(idempotencyKeys.key, idempotencyKey),
          gt(idempotencyKeys.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (existing && existing.statusCode && existing.responseBody) {
      res.status(existing.statusCode).json(existing.responseBody);
      return;
    }

    // Intercept response to cache it
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      // Store the response asynchronously (fire-and-forget)
      const expiresAt = new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000);
      this.db
        .insert(idempotencyKeys)
        .values({
          key: idempotencyKey,
          tenantId,
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          responseBody: body as Record<string, unknown>,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [idempotencyKeys.tenantId, idempotencyKeys.key],
          set: {
            statusCode: res.statusCode,
            responseBody: body as Record<string, unknown>,
          },
        })
        .catch(() => {
          // Idempotency caching failure is non-critical
        });

      return originalJson(body);
    };

    next();
  }
}
