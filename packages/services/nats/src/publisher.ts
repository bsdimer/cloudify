import { StringCodec, headers as natsHeaders } from 'nats';
import { randomUUID } from 'crypto';
import { getJetStreamClient } from './connection';
import { type EventEnvelope, createLogger } from '@cloudify/common';

const sc = StringCodec();
const logger = createLogger('NatsPublisher');

export interface PublishOptions {
  /** Source service name. */
  sourceService: string;
  /** Request correlation ID for tracing. */
  correlationId?: string;
  /** Deduplicate this message ID. */
  messageId?: string;
}

/**
 * Type-safe event publisher.
 *
 * Wraps payloads in a CloudifyEventEnvelope, serializes to JSON,
 * and publishes to the correct NATS JetStream subject.
 *
 * @example
 *   await publishEvent(
 *     'cloudify.resources.created',
 *     { resourceId: '...', resourceType: 'vm', name: 'my-vm', spec: {} },
 *     { sourceService: 'compute-service', correlationId: req.correlationId, tenantId: 'xxx' }
 *   );
 */
export async function publishEvent<T>(
  subject: string,
  payload: T,
  options: PublishOptions & { tenantId?: string | null },
): Promise<string> {
  const js = await getJetStreamClient();

  const eventId = options.messageId || randomUUID();
  const correlationId = options.correlationId || randomUUID();

  const envelope: EventEnvelope<T> = {
    eventId,
    eventType: subject.split('.').slice(1).join('.'),
    tenantId: options.tenantId !== undefined ? options.tenantId : null,
    correlationId,
    sourceService: options.sourceService,
    timestamp: new Date().toISOString(),
    version: 1,
    payload,
  };

  const data = sc.encode(JSON.stringify(envelope));

  // Set NATS headers for deduplication
  const hdrs = natsHeaders();
  hdrs.set('Nats-Msg-Id', eventId);

  const ack = await js.publish(subject, data, { headers: hdrs });

  logger.debug(`Event published: ${subject}`, {
    eventId,
    correlationId,
    tenantId: options.tenantId,
    stream: ack.stream,
    seq: ack.seq,
  });

  return eventId;
}

/**
 * Create a scoped publisher for a specific service.
 * Avoids passing sourceService on every call.
 */
export function createPublisher(sourceService: string) {
  return {
    publish<T>(
      subject: string,
      payload: T,
      options: { tenantId?: string | null; correlationId?: string; messageId?: string } = {},
    ) {
      return publishEvent(subject, payload, { ...options, sourceService });
    },
  };
}
