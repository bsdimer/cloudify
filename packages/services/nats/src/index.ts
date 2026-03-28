export { getNatsConnection, getJetStreamClient, getJetStreamManager, closeNatsConnection } from './connection';
export type { NatsConfig } from './connection';

export { ensureStreams, STREAM_CONFIGS, DEAD_LETTER_STREAM, DEFAULT_CONSUMER_CONFIG } from './streams';

export { publishEvent, createPublisher } from './publisher';
export type { PublishOptions } from './publisher';

export { consumeEvents } from './consumer';
export type { ConsumeOptions, EventHandler } from './consumer';
