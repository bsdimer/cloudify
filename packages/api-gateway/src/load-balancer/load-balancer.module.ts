import { Module } from '@nestjs/common';
import { LoadBalancerService } from './load-balancer.service';
import { LoadBalancerController } from './load-balancer.controller';
import { AuthModule } from '../auth/auth.module';
import { IamModule } from '../iam/iam.module';

@Module({
  imports: [AuthModule, IamModule],
  controllers: [LoadBalancerController],
  providers: [LoadBalancerService],
  exports: [LoadBalancerService],
})
export class LoadBalancerModule {}
