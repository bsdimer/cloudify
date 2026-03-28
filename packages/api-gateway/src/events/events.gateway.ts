import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    tenantId: string;
    role: string;
  };
}

/**
 * WebSocket gateway for real-time resource status updates.
 *
 * Clients connect with a JWT token and are automatically subscribed
 * to their tenant's event room. Services can broadcast events to
 * specific tenants using the EventsGateway.emitToTenant() method.
 */
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/events',
})
export class EventsGatewayWs implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger('EventsGateway');

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} disconnected: no token`);
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify(token);
      client.data = {
        userId: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
      };

      // Join tenant-specific room
      await client.join(`tenant:${payload.tenantId}`);

      this.logger.log(`Client ${client.id} connected (tenant: ${payload.tenantId})`);
      client.emit('connected', { message: 'Connected to Cloudify events' });
    } catch {
      this.logger.warn(`Client ${client.id} disconnected: invalid token`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: AuthenticatedSocket, resourceId: string) {
    // Clients can subscribe to specific resource updates
    client.join(`resource:${resourceId}`);
    return { event: 'subscribed', data: { resourceId } };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(client: AuthenticatedSocket, resourceId: string) {
    client.leave(`resource:${resourceId}`);
    return { event: 'unsubscribed', data: { resourceId } };
  }

  /**
   * Emit an event to all connected clients of a tenant.
   */
  emitToTenant(tenantId: string, event: string, data: unknown) {
    this.server.to(`tenant:${tenantId}`).emit(event, data);
  }

  /**
   * Emit an event to clients subscribed to a specific resource.
   */
  emitToResource(resourceId: string, event: string, data: unknown) {
    this.server.to(`resource:${resourceId}`).emit(event, data);
  }
}
