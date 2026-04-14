import { Module } from '@nestjs/common';
import { KubernetesService } from './kubernetes.service';
import { KubernetesController } from './kubernetes.controller';
import { AuthModule } from '../auth/auth.module';
import { IamModule } from '../iam/iam.module';

@Module({
  imports: [AuthModule, IamModule],
  controllers: [KubernetesController],
  providers: [KubernetesService],
  exports: [KubernetesService],
})
export class KubernetesModule {}
