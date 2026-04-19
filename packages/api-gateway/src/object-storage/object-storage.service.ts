import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { buckets, bucketAccessKeys, auditLogs } from '../database/schema';
import {
  type CreateBucketDto,
  type CreateBucketAccessKeyDto,
  type LifecycleRule,
  type PresignedUrlDto,
  type BucketAccess,
  type BucketVersioning,
} from '@cloudify/common';
import { randomBytes, createHash, createHmac } from 'crypto';

/**
 * S3-compatible bucket name validation (RFC 1123 + MinIO rules).
 */
const BUCKET_NAME_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);

  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  // ── Buckets ──

  async createBucket(tenantId: string, userId: string, dto: CreateBucketDto) {
    // Validate S3-compatible bucket name
    if (!BUCKET_NAME_RE.test(dto.name)) {
      throw new BadRequestException(
        'Bucket name must be 3-63 lowercase alphanumeric chars (dots/hyphens allowed, not leading/trailing)',
      );
    }

    // Bucket names must be globally unique (S3 compatibility)
    const [existing] = await this.db
      .select()
      .from(buckets)
      .where(eq(buckets.name, dto.name))
      .limit(1);

    if (existing) {
      throw new ConflictException(`Bucket name "${dto.name}" is already taken`);
    }

    const [bucket] = await this.db
      .insert(buckets)
      .values({
        tenantId,
        name: dto.name,
        access: (dto.access ?? 'private') as BucketAccess,
        versioning: (dto.versioning ?? 'disabled') as BucketVersioning,
        quotaGb: dto.quotaGb ?? null,
        lifecycleRules: dto.lifecycleRules ?? [],
        tags: dto.tags ?? {},
      })
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'create',
      resourceType: 'minio_bucket',
      diff: { bucket: { name: dto.name, access: dto.access, versioning: dto.versioning } },
    });

    this.logger.log(`Bucket "${bucket.name}" created for tenant ${tenantId}`);

    // In production: emit event → MinIO service creates bucket + applies policies
    return bucket;
  }

  async listBuckets(tenantId: string) {
    return this.db
      .select()
      .from(buckets)
      .where(eq(buckets.tenantId, tenantId))
      .orderBy(buckets.name);
  }

  async getBucket(tenantId: string, id: string) {
    const [bucket] = await this.db
      .select()
      .from(buckets)
      .where(and(eq(buckets.id, id), eq(buckets.tenantId, tenantId)))
      .limit(1);

    if (!bucket) {
      throw new NotFoundException(`Bucket ${id} not found`);
    }

    return bucket;
  }

  async updateBucketAccess(tenantId: string, id: string, userId: string, access: BucketAccess) {
    const bucket = await this.getBucket(tenantId, id);

    const [updated] = await this.db
      .update(buckets)
      .set({ access, status: 'updating' })
      .where(eq(buckets.id, id))
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'update',
      resourceType: 'minio_bucket',
      diff: { bucket: bucket.name, from: bucket.access, to: access },
    });

    this.logger.log(`Bucket "${bucket.name}" access changed to ${access}`);
    return updated;
  }

  async updateVersioning(
    tenantId: string,
    id: string,
    userId: string,
    versioning: BucketVersioning,
  ) {
    const bucket = await this.getBucket(tenantId, id);

    const [updated] = await this.db
      .update(buckets)
      .set({ versioning, status: 'updating' })
      .where(eq(buckets.id, id))
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'update',
      resourceType: 'minio_bucket',
      diff: { bucket: bucket.name, versioning },
    });

    this.logger.log(`Bucket "${bucket.name}" versioning changed to ${versioning}`);
    return updated;
  }

  async updateLifecycleRules(tenantId: string, id: string, userId: string, rules: LifecycleRule[]) {
    const bucket = await this.getBucket(tenantId, id);

    const [updated] = await this.db
      .update(buckets)
      .set({ lifecycleRules: rules, status: 'updating' })
      .where(eq(buckets.id, id))
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'update',
      resourceType: 'minio_bucket',
      diff: { bucket: bucket.name, lifecycleRules: rules.length },
    });

    this.logger.log(`Bucket "${bucket.name}" lifecycle rules updated (${rules.length})`);
    return updated;
  }

  async deleteBucket(tenantId: string, id: string, userId: string) {
    const bucket = await this.getBucket(tenantId, id);

    const [updated] = await this.db
      .update(buckets)
      .set({ status: 'deleting' })
      .where(eq(buckets.id, id))
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'delete',
      resourceType: 'minio_bucket',
      diff: { bucket: bucket.name },
    });

    this.logger.log(`Bucket "${bucket.name}" (${id}) deletion initiated`);
    return updated;
  }

  // ── Bucket Access Keys (S3 credentials) ──

  async createAccessKey(
    tenantId: string,
    bucketId: string,
    userId: string,
    dto: CreateBucketAccessKeyDto,
  ) {
    const bucket = await this.getBucket(tenantId, bucketId);

    const accessKey = `CF${randomBytes(16).toString('hex').toUpperCase()}`;
    const secretKey = randomBytes(30).toString('base64').replace(/[+/=]/g, '');
    const secretKeyHash = createHash('sha256').update(secretKey).digest('hex');

    const [key] = await this.db
      .insert(bucketAccessKeys)
      .values({
        bucketId,
        tenantId,
        name: dto.name,
        accessKey,
        secretKeyHash,
        readOnly: dto.readOnly ?? false,
        prefixRestriction: dto.prefixRestriction ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      })
      .returning();

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'api_key_created',
      resourceType: 'minio_bucket',
      diff: { bucket: bucket.name, keyName: dto.name, readOnly: dto.readOnly },
    });

    this.logger.log(`Access key "${dto.name}" issued for bucket "${bucket.name}"`);

    return {
      id: key.id,
      bucketId,
      name: key.name,
      accessKey,
      secretKey, // Only returned here, not stored in plaintext
      readOnly: key.readOnly,
      prefixRestriction: key.prefixRestriction,
      expiresAt: key.expiresAt?.toISOString() ?? null,
      createdAt: key.createdAt.toISOString(),
    };
  }

  async listAccessKeys(tenantId: string, bucketId: string) {
    await this.getBucket(tenantId, bucketId);

    return this.db
      .select({
        id: bucketAccessKeys.id,
        name: bucketAccessKeys.name,
        accessKey: bucketAccessKeys.accessKey,
        readOnly: bucketAccessKeys.readOnly,
        prefixRestriction: bucketAccessKeys.prefixRestriction,
        expiresAt: bucketAccessKeys.expiresAt,
        lastUsedAt: bucketAccessKeys.lastUsedAt,
        createdAt: bucketAccessKeys.createdAt,
      })
      .from(bucketAccessKeys)
      .where(and(eq(bucketAccessKeys.tenantId, tenantId), eq(bucketAccessKeys.bucketId, bucketId)))
      .orderBy(bucketAccessKeys.createdAt);
  }

  async deleteAccessKey(tenantId: string, keyId: string, userId: string) {
    const [key] = await this.db
      .select()
      .from(bucketAccessKeys)
      .where(and(eq(bucketAccessKeys.id, keyId), eq(bucketAccessKeys.tenantId, tenantId)))
      .limit(1);

    if (!key) {
      throw new NotFoundException(`Access key ${keyId} not found`);
    }

    await this.db.delete(bucketAccessKeys).where(eq(bucketAccessKeys.id, keyId));

    await this.db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'api_key_revoked',
      resourceType: 'minio_bucket',
      diff: { keyName: key.name },
    });

    this.logger.log(`Access key "${key.name}" (${keyId}) deleted`);
    return { message: `Access key "${key.name}" revoked` };
  }

  // ── Presigned URLs ──

  /**
   * Generate a presigned URL for temporary access to a bucket object.
   * In production this would use the MinIO SDK — here we generate a compatible
   * SigV4-style signature for structure validation.
   */
  async generatePresignedUrl(
    tenantId: string,
    dto: PresignedUrlDto,
  ): Promise<{ url: string; expiresAt: string }> {
    const [bucket] = await this.db
      .select()
      .from(buckets)
      .where(and(eq(buckets.name, dto.bucketName), eq(buckets.tenantId, tenantId)))
      .limit(1);

    if (!bucket) {
      throw new NotFoundException(`Bucket "${dto.bucketName}" not found`);
    }

    const expirySeconds = Math.min(Math.max(dto.expirySeconds ?? 3600, 60), 604800); // 1m–7d
    const expiresAt = new Date(Date.now() + expirySeconds * 1000);
    const endpoint = bucket.endpoint ?? `https://storage.cloudify.example.com`;

    // Simplified presigned URL (for real, use minio client)
    const policy = createHmac('sha256', 'dev-signing-key')
      .update(`${dto.method}\n${dto.bucketName}/${dto.objectKey}\n${expiresAt.getTime()}`)
      .digest('hex');

    const url = `${endpoint}/${dto.bucketName}/${dto.objectKey}?X-Cf-Method=${dto.method}&X-Cf-Expires=${expiresAt.getTime()}&X-Cf-Signature=${policy}`;

    return { url, expiresAt: expiresAt.toISOString() };
  }
}
