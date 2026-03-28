import { RetentionPolicy, StorageType, AckPolicy, DeliverPolicy, type StreamConfig } from 'nats';
import { getJetStreamManager } from './connection';
import { EVENT_STREAMS } from '@cloudify/common';
import { createLogger } from '@cloudify/common';

const logger = createLogger('NatsStreams');

/**
 * Stream configurations for all Cloudify event streams.
 * Each stream has retention, storage, and consumer settings tuned for its use case.
 */
export const STREAM_CONFIGS: Record<string, Partial<StreamConfig>> = {
  [EVENT_STREAMS.RESOURCES]: {
    subjects: [`${EVENT_STREAMS.RESOURCES}.>`],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 1_000_000,
    max_age: 30 * 24 * 60 * 60 * 1_000_000_000, // 30 days in nanoseconds
    max_bytes: 1024 * 1024 * 1024, // 1 GB
    duplicate_window: 120_000_000_000, // 2 minutes dedup
    num_replicas: 1, // increase in production
  },
  [EVENT_STREAMS.TENANTS]: {
    subjects: [`${EVENT_STREAMS.TENANTS}.>`],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 100_000,
    max_age: 90 * 24 * 60 * 60 * 1_000_000_000, // 90 days
    duplicate_window: 120_000_000_000,
    num_replicas: 1,
  },
  [EVENT_STREAMS.BILLING]: {
    subjects: [`${EVENT_STREAMS.BILLING}.>`],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 10_000_000,
    max_age: 365 * 24 * 60 * 60 * 1_000_000_000, // 1 year
    duplicate_window: 120_000_000_000,
    num_replicas: 1,
  },
  [EVENT_STREAMS.AUDIT]: {
    subjects: [`${EVENT_STREAMS.AUDIT}.>`],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 10_000_000,
    max_age: 365 * 24 * 60 * 60 * 1_000_000_000, // 1 year (compliance)
    duplicate_window: 120_000_000_000,
    num_replicas: 1,
  },
  [EVENT_STREAMS.NETWORK]: {
    subjects: [`${EVENT_STREAMS.NETWORK}.>`],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 500_000,
    max_age: 30 * 24 * 60 * 60 * 1_000_000_000,
    duplicate_window: 120_000_000_000,
    num_replicas: 1,
  },
  [EVENT_STREAMS.CERTIFICATES]: {
    subjects: [`${EVENT_STREAMS.CERTIFICATES}.>`],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 100_000,
    max_age: 90 * 24 * 60 * 60 * 1_000_000_000,
    duplicate_window: 120_000_000_000,
    num_replicas: 1,
  },
  [EVENT_STREAMS.GITOPS]: {
    subjects: [`${EVENT_STREAMS.GITOPS}.>`],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 500_000,
    max_age: 30 * 24 * 60 * 60 * 1_000_000_000,
    duplicate_window: 120_000_000_000,
    num_replicas: 1,
  },
  [EVENT_STREAMS.FIREWALL]: {
    subjects: [`${EVENT_STREAMS.FIREWALL}.>`],
    retention: RetentionPolicy.Limits,
    storage: StorageType.File,
    max_msgs: 1_000_000,
    max_age: 30 * 24 * 60 * 60 * 1_000_000_000,
    duplicate_window: 120_000_000_000,
    num_replicas: 1,
  },
};

/**
 * Dead letter stream — events that failed processing after max retries.
 */
export const DEAD_LETTER_STREAM = 'cloudify.deadletter';
const DEAD_LETTER_CONFIG: Partial<StreamConfig> = {
  subjects: [`${DEAD_LETTER_STREAM}.>`],
  retention: RetentionPolicy.Limits,
  storage: StorageType.File,
  max_msgs: 1_000_000,
  max_age: 90 * 24 * 60 * 60 * 1_000_000_000, // 90 days
  num_replicas: 1,
};

/**
 * Default consumer configuration for durable consumers.
 */
export const DEFAULT_CONSUMER_CONFIG = {
  ack_policy: AckPolicy.Explicit,
  deliver_policy: DeliverPolicy.All,
  max_deliver: 5, // Max redelivery attempts before DLQ
  ack_wait: 30_000_000_000, // 30s ack timeout in nanoseconds
};

/**
 * Create or update all Cloudify streams.
 * Safe to call multiple times (idempotent).
 */
export async function ensureStreams(): Promise<void> {
  const jsm = await getJetStreamManager();

  // Sanitize stream name: NATS stream names cannot contain dots
  const sanitizeName = (name: string) => name.replace(/\./g, '-');

  for (const [streamKey, config] of Object.entries(STREAM_CONFIGS)) {
    const name = sanitizeName(streamKey);
    try {
      await jsm.streams.info(name);
      // Stream exists — update config (name not allowed in update)
      const { ...updateConfig } = config;
      await jsm.streams.update(name, updateConfig);
      logger.info(`Stream updated: ${name}`);
    } catch {
      await jsm.streams.add({ ...config, name } as StreamConfig);
      logger.info(`Stream created: ${name}`);
    }
  }

  // Create dead letter stream
  const dlqName = sanitizeName(DEAD_LETTER_STREAM);
  try {
    await jsm.streams.info(dlqName);
    const { ...dlqUpdateConfig } = DEAD_LETTER_CONFIG;
    await jsm.streams.update(dlqName, dlqUpdateConfig);
    logger.info(`Dead letter stream updated: ${dlqName}`);
  } catch {
    await jsm.streams.add({ ...DEAD_LETTER_CONFIG, name: dlqName } as StreamConfig);
    logger.info(`Dead letter stream created: ${dlqName}`);
  }
}
