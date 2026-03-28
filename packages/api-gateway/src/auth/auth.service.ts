import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { eq, and, gt, lt } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { users, apiKeys, revokedTokens } from '../database/schema';
import { createHash, randomBytes, randomUUID } from 'crypto';

const REFRESH_TOKEN_EXPIRY = 604800; // 7 days in seconds

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async validateUser(email: string, password: string) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  private buildTokenPayload(user: { id: string; email: string; tenantId: string; role: string }) {
    return {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
      jti: randomUUID(),
    };
  }

  private signTokens(payload: Record<string, unknown>) {
    const accessToken = this.jwtService.sign(payload);

    const refreshPayload = { ...payload, jti: randomUUID(), type: 'refresh' };
    const refreshToken = this.jwtService.sign(refreshPayload, {
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.get<number>('JWT_EXPIRES_IN_SECONDS', 900),
    };
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    const payload = this.buildTokenPayload(user);
    return this.signTokens(payload);
  }

  async refreshToken(refreshToken: string) {
    try {
      const decoded = this.jwtService.verify(refreshToken);

      // Check if the refresh token has been revoked
      if (decoded.jti) {
        const [revoked] = await this.db
          .select()
          .from(revokedTokens)
          .where(eq(revokedTokens.jti, decoded.jti))
          .limit(1);

        if (revoked) {
          throw new UnauthorizedException('Token has been revoked');
        }
      }

      const [user] = await this.db.select().from(users).where(eq(users.id, decoded.sub)).limit(1);

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Revoke the old refresh token (rotate)
      if (decoded.jti) {
        await this.db
          .insert(revokedTokens)
          .values({
            jti: decoded.jti,
            userId: decoded.sub as string,
            expiresAt: new Date(decoded.exp * 1000),
          })
          .onConflictDoNothing();
      }

      const payload = this.buildTokenPayload(user);
      return this.signTokens(payload);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Logout — revoke the current access token and refresh token.
   */
  async logout(accessTokenJti: string, userId: string, tokenExp: number) {
    await this.db
      .insert(revokedTokens)
      .values({
        jti: accessTokenJti,
        userId,
        expiresAt: new Date(tokenExp * 1000),
      })
      .onConflictDoNothing();
  }

  /**
   * Check if a token JTI has been revoked.
   */
  async isTokenRevoked(jti: string): Promise<boolean> {
    const [revoked] = await this.db
      .select()
      .from(revokedTokens)
      .where(and(eq(revokedTokens.jti, jti), gt(revokedTokens.expiresAt, new Date())))
      .limit(1);

    return !!revoked;
  }

  /**
   * Cleanup expired revoked tokens (run periodically).
   */
  async cleanupRevokedTokens(): Promise<number> {
    const result = await this.db
      .delete(revokedTokens)
      .where(lt(revokedTokens.expiresAt, new Date()))
      .returning();

    return result.length;
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async createApiKey(userId: string, tenantId: string, name: string, scopes: string[]) {
    const rawKey = `cf_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const [created] = await this.db
      .insert(apiKeys)
      .values({
        userId,
        tenantId,
        keyHash,
        name,
        scopes,
      })
      .returning();

    return {
      id: created.id,
      name: created.name,
      key: rawKey,
      scopes: created.scopes,
      expiresAt: created.expiresAt?.toISOString() ?? null,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async validateApiKey(rawKey: string) {
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const [key] = await this.db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);

    if (!key) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (key.expiresAt && key.expiresAt < new Date()) {
      throw new UnauthorizedException('API key expired');
    }

    await this.db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, key.id));

    return {
      userId: key.userId,
      tenantId: key.tenantId,
      scopes: key.scopes,
    };
  }
}
