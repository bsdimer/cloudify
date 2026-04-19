/**
 * Managed Services types: PostgreSQL, MongoDB, Valkey, MinIO.
 */

// ── Instance Sizing ──

export type InstanceSize = 'nano' | 'micro' | 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';

export interface InstanceSpec {
  cpus: number;
  memoryMb: number;
  storageGb: number;
}

export const INSTANCE_SIZES: Record<InstanceSize, InstanceSpec> = {
  nano: { cpus: 1, memoryMb: 512, storageGb: 10 },
  micro: { cpus: 1, memoryMb: 1024, storageGb: 20 },
  small: { cpus: 2, memoryMb: 2048, storageGb: 50 },
  medium: { cpus: 2, memoryMb: 4096, storageGb: 100 },
  large: { cpus: 4, memoryMb: 8192, storageGb: 200 },
  xlarge: { cpus: 8, memoryMb: 16384, storageGb: 500 },
  xxlarge: { cpus: 16, memoryMb: 32768, storageGb: 1000 },
};

// ── Common Managed Service Status ──

export type ManagedServiceStatus =
  | 'provisioning'
  | 'active'
  | 'updating'
  | 'backing_up'
  | 'restoring'
  | 'failing_over'
  | 'deleting'
  | 'deleted'
  | 'error';

export interface BackupPolicy {
  enabled: boolean;
  scheduleCron?: string; // e.g., '0 2 * * *' for 2am daily
  retentionDays: number;
  pointInTimeRecovery?: boolean;
}

export const DEFAULT_BACKUP_POLICY: BackupPolicy = {
  enabled: true,
  scheduleCron: '0 2 * * *',
  retentionDays: 7,
  pointInTimeRecovery: true,
};

// ── Managed PostgreSQL ──

export interface CreatePostgresDto {
  name: string;
  version: string; // '16', '15', '14'
  size: InstanceSize;
  readReplicas?: number; // 0-5
  highAvailability?: boolean;
  publicAccess?: boolean;
  backupPolicy?: Partial<BackupPolicy>;
  connectionPooling?: boolean; // PgBouncer
  vpcId?: string;
  tags?: Record<string, string>;
}

export interface ScalePostgresDto {
  size?: InstanceSize;
  readReplicas?: number;
  storageGb?: number;
}

export interface PostgresInstanceInfo {
  id: string;
  tenantId: string;
  name: string;
  version: string;
  size: InstanceSize;
  status: ManagedServiceStatus;
  readReplicas: number;
  highAvailability: boolean;
  connectionEndpoint: string;
  readEndpoint: string | null;
  port: number;
  backupPolicy: BackupPolicy;
  connectionPooling: boolean;
  storageGb: number;
  createdAt: string;
}

export const SUPPORTED_POSTGRES_VERSIONS = ['16', '15', '14', '13'] as const;

// ── Managed MongoDB ──

export interface CreateMongoDbDto {
  name: string;
  version: string; // '7.0', '6.0'
  size: InstanceSize;
  replicaSetSize: 1 | 3 | 5; // 1 = standalone, 3+ = replica set
  publicAccess?: boolean;
  backupPolicy?: Partial<BackupPolicy>;
  vpcId?: string;
  tags?: Record<string, string>;
}

export interface MongoDbInstanceInfo {
  id: string;
  tenantId: string;
  name: string;
  version: string;
  size: InstanceSize;
  status: ManagedServiceStatus;
  replicaSetSize: number;
  connectionUri: string;
  backupPolicy: BackupPolicy;
  storageGb: number;
  createdAt: string;
}

export const SUPPORTED_MONGODB_VERSIONS = ['7.0', '6.0', '5.0'] as const;

// ── Managed Valkey ──

export type ValkeyMode = 'standalone' | 'cluster';
export type ValkeyPersistence = 'none' | 'rdb' | 'aof' | 'rdb-aof';
export type ValkeyEvictionPolicy =
  | 'noeviction'
  | 'allkeys-lru'
  | 'allkeys-lfu'
  | 'volatile-lru'
  | 'volatile-lfu'
  | 'allkeys-random'
  | 'volatile-random'
  | 'volatile-ttl';

export interface CreateValkeyDto {
  name: string;
  version: string; // '7.2', '8.0'
  size: InstanceSize;
  mode: ValkeyMode;
  persistence?: ValkeyPersistence;
  evictionPolicy?: ValkeyEvictionPolicy;
  clusterShards?: number; // for cluster mode
  replicasPerShard?: number; // for cluster mode
  password?: boolean; // if true, generate a password; false for no auth (not recommended)
  publicAccess?: boolean;
  vpcId?: string;
  tags?: Record<string, string>;
}

export interface ValkeyInstanceInfo {
  id: string;
  tenantId: string;
  name: string;
  version: string;
  size: InstanceSize;
  status: ManagedServiceStatus;
  mode: ValkeyMode;
  persistence: ValkeyPersistence;
  evictionPolicy: ValkeyEvictionPolicy;
  connectionEndpoint: string;
  port: number;
  clusterShards: number;
  replicasPerShard: number;
  memoryMb: number;
  createdAt: string;
}

export const SUPPORTED_VALKEY_VERSIONS = ['8.0', '7.2'] as const;

// ── Object Storage (MinIO) ──

export type BucketVersioning = 'enabled' | 'suspended' | 'disabled';
export type BucketAccess = 'private' | 'public-read' | 'public-read-write';

export interface LifecycleRule {
  id: string;
  enabled: boolean;
  prefix?: string;
  expirationDays?: number;
  transitionDays?: number;
  transitionStorageClass?: string;
}

export interface CreateBucketDto {
  name: string;
  access?: BucketAccess;
  versioning?: BucketVersioning;
  quotaGb?: number;
  lifecycleRules?: LifecycleRule[];
  tags?: Record<string, string>;
}

export interface BucketInfo {
  id: string;
  tenantId: string;
  name: string;
  access: BucketAccess;
  versioning: BucketVersioning;
  quotaGb: number | null;
  usedGb: number;
  objectCount: number;
  lifecycleRules: LifecycleRule[];
  endpoint: string;
  region: string;
  createdAt: string;
}

export interface CreateBucketAccessKeyDto {
  name: string;
  readOnly?: boolean;
  prefixRestriction?: string; // limit access to a key prefix within the bucket
  expiresAt?: string;
}

export interface BucketAccessKeyInfo {
  id: string;
  bucketId: string;
  accessKey: string;
  secretKey?: string; // only returned on creation
  name: string;
  readOnly: boolean;
  prefixRestriction: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface PresignedUrlDto {
  bucketName: string;
  objectKey: string;
  method: 'GET' | 'PUT' | 'DELETE';
  expirySeconds?: number;
}
