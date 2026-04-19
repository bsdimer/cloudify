import { Module } from '@nestjs/common';
import { ObjectStorageService } from './object-storage.service';
import { ObjectStorageController } from './object-storage.controller';
import { AuthModule } from '../auth/auth.module';
import { IamModule } from '../iam/iam.module';

@Module({
  imports: [AuthModule, IamModule],
  controllers: [ObjectStorageController],
  providers: [ObjectStorageService],
  exports: [ObjectStorageService],
})
export class ObjectStorageModule {}
