import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { HealthModule } from './health/health.module';
import { EventsModule } from './events/events.module';
import { IamModule } from './iam/iam.module';
import { ComputeModule } from './compute/compute.module';
import { KubernetesModule } from './kubernetes/kubernetes.module';
import { NetworkingModule } from './networking/networking.module';
import { IpamModule } from './ipam/ipam.module';
import { LoadBalancerModule } from './load-balancer/load-balancer.module';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';
import { IdempotencyMiddleware } from './common/idempotency.middleware';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { AuditLogInterceptor } from './common/audit-log.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100,
      },
    ]),
    DatabaseModule,
    AuthModule,
    TenantsModule,
    HealthModule,
    EventsModule,
    IamModule,
    ComputeModule,
    KubernetesModule,
    NetworkingModule,
    IpamModule,
    LoadBalancerModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
    consumer.apply(IdempotencyMiddleware).forRoutes('*');
  }
}
