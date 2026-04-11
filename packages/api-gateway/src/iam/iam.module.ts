import { Module } from '@nestjs/common';
import { IamService } from './iam.service';
import { IamController } from './iam.controller';
import { AuthModule } from '../auth/auth.module';
import { PermissionsGuard } from './permissions.guard';

@Module({
  imports: [AuthModule],
  controllers: [IamController],
  providers: [IamService, PermissionsGuard],
  exports: [IamService, PermissionsGuard],
})
export class IamModule {}
