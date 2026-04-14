import { Module } from '@nestjs/common';
import { IpamService } from './ipam.service';
import { IpamController } from './ipam.controller';
import { AuthModule } from '../auth/auth.module';
import { IamModule } from '../iam/iam.module';

@Module({
  imports: [AuthModule, IamModule],
  controllers: [IpamController],
  providers: [IpamService],
  exports: [IpamService],
})
export class IpamModule {}
