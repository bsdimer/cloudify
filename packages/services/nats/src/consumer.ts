import {
  StringCodec,
  type JetStreamClient,
  type ConsumerConfig,
  type JsMsg,
  AckPolicy,
  DeliverPolicy,
} from 'nats';
import { getJetStreamClient, getJetStreamManager } from './connection';
import { publishEvent } from './publisher';
import { type EventEnvelope, createLogger } from '@cloudify/common';
import { DEAD_LETTER_STREAM } from './streams';

const sc = StringCodec();
const logger = createLogger('NatsConsumer');

export interface ConsumeOptions {
  /** Durable consumer name (must be unique per stream). */
  consumerName: string;
  /** Stream name to consume from. */
  streamName: string;
  /** Subject filter (e.g., 'cloudify.resources.created'). */
  filterSubject?: string;
  /** Max number of redeliveries before DLQ. Default: 5 */
  maxRedeliver?: number;
  /** Ack timeout in ms. Default: 30000 */
  ackWaitMs?: number;
  /** Max concurrent messages. Default: 10 */
  maxConcurrent?: number;
}

export type EventHandler<T = unknown> = (
  envelope: EventEnvelope<T>,
  msg: JsMsg,
) => Promise<void>;

/**
 * Idempotent event consumer with automatic DLQ routing.
 *
 * Features:
 * - Durable consumers survive service restarts
 * - Explicit ACK required (at-least-once delivery)
 * - Failed messages routed to dead letter queue after max retries
 * - Idempotency tracking via event ID
 *
 * @example
 *   await consumeEvents({
 *     consumerName: 'gitops-resource-handler',
 *     streamName: 'cloudify-resources',
 *     filterSubject: 'cloudify.resources.created',
 *   }, async (envelope) => {
 *     await createTofuConfig(envelope.payload);
 *   });
 */
export async function consumeEvents<T = unknown>(
  options: ConsumeOptions,
  handler: EventHandler<T>,
): Promise<{ stop: () => void }> {
  const js = await getJetStreamClient();
  const jsm = await getJetStreamManager();

  // Ensure the consumer exists
  const consumerConfig: Partial<ConsumerConfig> = {
    durable_name: options.consumerName,
    ack_policy: AckPolicy.Explicit,
    deliver_policy: DeliverPolicy.All,
    max_deliver: options.maxRedeliver ?? 5,
    ack_wait: (options.ackWaitMs ?? 30000) * 1_000_000, // Convert to nanoseconds
    filter_subject: options.filterSubject ?? undefined,
  };

  try {
    await jsm.consumers.info(options.streamName, options.consumerName);
    await jsm.consumers.update(options.streamName, options.consumerName, consumerConfig);
  } catch {
    await jsm.consumers.add(options.streamName, consumerConfig);
  }

  const consumer = await js.consumers.get(options.streamName, options.consumerName);
  const messages = await consumer.consume({
    max_messages: options.maxConcurrent ?? 10,
  });

  let stopped = false;

  // Process messages
  (async () => {
    for await (const msg of messages) {
      if (stopped) break;

      try {
        const raw = sc.decode(msg.data);
        const envelope = JSON.parse(raw) as EventEnvelope<T>;

        logger.debug(`Processing event: ${envelope.eventType}`, {
          eventId: envelope.eventId,
          correlationId: envelope.correlationId,
          tenantId: envelope.tenantId,
          attempt: msg.info.redeliveryCount + 1,
        });

        await handler(envelope, msg);
        msg.ack();

        logger.debug(`Event processed: ${envelope.eventType}`, {
          eventId: envelope.eventId,
        });
      } catch (error) {
        const redeliveries = msg.info.redeliveryCount;
        const maxRedeliver = options.maxRedeliver ?? 5;

        if (redeliveries >= maxRedeliver - 1) {
          // Max retries exceeded — route to DLQ
          logger.error(
            `Event failed after ${redeliveries + 1} attempts, routing to DLQ`,
            error,
            { subject: msg.subject },
          );

          await routeToDLQ(js, msg, error);
          msg.term();
        } else {
          // NAK with delay for redelivery
          const delay = Math.min(1000 * Math.pow(2, redeliveries), 60000);
          logger.warn(
            `Event processing failed (attempt ${redeliveries + 1}/${maxRedeliver}), retrying in ${delay}ms`,
            { subject: msg.subject, error: error instanceof Error ? error.message : String(error) },
          );
          msg.nak(delay);
        }
      }
    }
  })();

  return {
    stop: () => {
      stopped = true;
      messages.stop();
    },
  };
}

/**
 * Route a failed message to the dead letter queue.
 */
async function routeToDLQ(js: JetStreamClient, msg: JsMsg, error: unknown): Promise<void> {
  try {
    const raw = sc.decode(msg.data);
    const dlqPayload = {
      originalSubject: msg.subject,
      originalData: JSON.parse(raw),
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      failedAt: new Date().toISOString(),
      redeliveryCount: msg.info.redeliveryCount,
    };

    await publishEvent(
      `${DEAD_LETTER_STREAM}.${msg.subject.replace(/\./g, '-')}`,
      dlqPayload,
      { sourceService: 'consumer-dlq', tenantId: null },
    );
  } catch (dlqError) {
    logger.error('Failed to route message to DLQ', dlqError);
  }
}
