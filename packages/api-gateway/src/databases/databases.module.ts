import { Module } from '@nestjs/common';
import { PostgresService } from './postgres.service';
import { MongoDbService } from './mongodb.service';
import { ValkeyService } from './valkey.service';
import { DatabasesController } from './databases.controller';
import { AuthModule } from '../auth/auth.module';
import { IamModule } from '../iam/iam.module';

@Module({
  imports: [AuthModule, IamModule],
  controllers: [DatabasesController],
  providers: [PostgresService, MongoDbService, ValkeyService],
  exports: [PostgresService, MongoDbService, ValkeyService],
})
export class DatabasesModule {}
