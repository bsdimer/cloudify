import { Module } from '@nestjs/common';
import { ComputeService } from './compute.service';
import { ComputeController } from './compute.controller';
import { AuthModule } from '../auth/auth.module';
import { IamModule } from '../iam/iam.module';

@Module({
  imports: [AuthModule, IamModule],
  controllers: [ComputeController],
  providers: [ComputeService],
  exports: [ComputeService],
})
export class ComputeModule {}
