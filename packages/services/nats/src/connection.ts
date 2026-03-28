import { connect, NatsConnection, JetStreamClient, JetStreamManager, ConnectionOptions } from 'nats';
import { createLogger, type StructuredLogger } from '@cloudify/common';

const DEFAULT_NATS_URL = 'nats://localhost:4222';

export interface NatsConfig {
  url?: string;
  name?: string;
  maxReconnectAttempts?: number;
  reconnectTimeWait?: number;
}

let _connection: NatsConnection | null = null;
let _jsClient: JetStreamClient | null = null;
let _jsManager: JetStreamManager | null = null;

const logger: StructuredLogger = createLogger('NatsConnection');

/**
 * Connect to NATS and return the connection.
 * Reuses existing connection if available.
 */
export async function getNatsConnection(config: NatsConfig = {}): Promise<NatsConnection> {
  if (_connection && !_connection.isClosed()) {
    return _connection;
  }

  const opts: ConnectionOptions = {
    servers: config.url || process.env.NATS_URL || DEFAULT_NATS_URL,
    name: config.name || 'cloudify',
    maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
    reconnectTimeWait: config.reconnectTimeWait ?? 2000,
  };

  logger.info(`Connecting to NATS at ${opts.servers}`);
  _connection = await connect(opts);
  logger.info('Connected to NATS');

  // Listen for connection events
  (async () => {
    if (!_connection) return;
    for await (const status of _connection.status()) {
      switch (status.type) {
        case 'reconnect':
          logger.info('NATS reconnected');
          break;
        case 'disconnect':
          logger.warn('NATS disconnected');
          break;
        case 'error':
          logger.error('NATS error', status.data as unknown as Error);
          break;
      }
    }
  })();

  return _connection;
}

/**
 * Get JetStream client for publishing/subscribing to streams.
 */
export async function getJetStreamClient(config: NatsConfig = {}): Promise<JetStreamClient> {
  if (_jsClient) return _jsClient;

  const nc = await getNatsConnection(config);
  _jsClient = nc.jetstream();
  return _jsClient;
}

/**
 * Get JetStream manager for stream/consumer administration.
 */
export async function getJetStreamManager(config: NatsConfig = {}): Promise<JetStreamManager> {
  if (_jsManager) return _jsManager;

  const nc = await getNatsConnection(config);
  _jsManager = await nc.jetstreamManager();
  return _jsManager;
}

/**
 * Gracefully close the NATS connection.
 */
export async function closeNatsConnection(): Promise<void> {
  if (_connection && !_connection.isClosed()) {
    logger.info('Closing NATS connection');
    await _connection.drain();
    _connection = null;
    _jsClient = null;
    _jsManager = null;
  }
}
