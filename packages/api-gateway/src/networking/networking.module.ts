import { Module } from '@nestjs/common';
import { NetworkingService } from './networking.service';
import { NetworkingController } from './networking.controller';
import { AuthModule } from '../auth/auth.module';
import { IamModule } from '../iam/iam.module';

@Module({
  imports: [AuthModule, IamModule],
  controllers: [NetworkingController],
  providers: [NetworkingService],
  exports: [NetworkingService],
})
export class NetworkingModule {}
