import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsIn,
  IsBoolean,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PostgresService } from './postgres.service';
import { MongoDbService } from './mongodb.service';
import { ValkeyService } from './valkey.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PermissionsGuard } from '../iam/permissions.guard';
import { CurrentUser, type RequestUser } from '../auth/decorators';
import { RequirePermissions } from '../iam/decorators';

// ── DTOs ──

class BackupPolicyDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  scheduleCron?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  retentionDays?: number;

  @IsOptional()
  @IsBoolean()
  pointInTimeRecovery?: boolean;
}

class CreatePostgresBodyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsString()
  version!: string;

  @IsIn(['nano', 'micro', 'small', 'medium', 'large', 'xlarge', 'xxlarge'])
  size!: 'nano' | 'micro' | 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  readReplicas?: number;

  @IsOptional()
  @IsBoolean()
  highAvailability?: boolean;

  @IsOptional()
  @IsBoolean()
  publicAccess?: boolean;

  @IsOptional()
  @IsBoolean()
  connectionPooling?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => BackupPolicyDto)
  backupPolicy?: BackupPolicyDto;

  @IsOptional()
  @IsString()
  vpcId?: string;

  @IsOptional()
  @IsObject()
  tags?: Record<string, string>;
}

class ScalePostgresBodyDto {
  @IsOptional()
  @IsIn(['nano', 'micro', 'small', 'medium', 'large', 'xlarge', 'xxlarge'])
  size?: 'nano' | 'micro' | 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  readReplicas?: number;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(10240)
  storageGb?: number;
}

class CreateMongoDbBodyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsString()
  version!: string;

  @IsIn(['nano', 'micro', 'small', 'medium', 'large', 'xlarge', 'xxlarge'])
  size!: 'nano' | 'micro' | 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';

  @IsIn([1, 3, 5])
  replicaSetSize!: 1 | 3 | 5;

  @IsOptional()
  @IsBoolean()
  publicAccess?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => BackupPolicyDto)
  backupPolicy?: BackupPolicyDto;

  @IsOptional()
  @IsString()
  vpcId?: string;

  @IsOptional()
  @IsObject()
  tags?: Record<string, string>;
}

class CreateValkeyBodyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsString()
  version!: string;

  @IsIn(['nano', 'micro', 'small', 'medium', 'large', 'xlarge', 'xxlarge'])
  size!: 'nano' | 'micro' | 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';

  @IsIn(['standalone', 'cluster'])
  mode!: 'standalone' | 'cluster';

  @IsOptional()
  @IsIn(['none', 'rdb', 'aof', 'rdb-aof'])
  persistence?: 'none' | 'rdb' | 'aof' | 'rdb-aof';

  @IsOptional()
  @IsIn([
    'noeviction',
    'allkeys-lru',
    'allkeys-lfu',
    'volatile-lru',
    'volatile-lfu',
    'allkeys-random',
    'volatile-random',
    'volatile-ttl',
  ])
  evictionPolicy?:
    | 'noeviction'
    | 'allkeys-lru'
    | 'allkeys-lfu'
    | 'volatile-lru'
    | 'volatile-lfu'
    | 'allkeys-random'
    | 'volatile-random'
    | 'volatile-ttl';

  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(16)
  clusterShards?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  replicasPerShard?: number;

  @IsOptional()
  @IsBoolean()
  password?: boolean;

  @IsOptional()
  @IsBoolean()
  publicAccess?: boolean;

  @IsOptional()
  @IsString()
  vpcId?: string;

  @IsOptional()
  @IsObject()
  tags?: Record<string, string>;
}

class BackupBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;
}

class RestoreBodyDto {
  @IsString()
  backupId!: string;
}

class UpdateValkeyConfigBodyDto {
  @IsOptional()
  @IsString()
  evictionPolicy?: string;

  @IsOptional()
  @IsIn(['none', 'rdb', 'aof', 'rdb-aof'])
  persistence?: 'none' | 'rdb' | 'aof' | 'rdb-aof';
}

// ── Controller ──

@ApiTags('databases')
@Controller('databases')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class DatabasesController {
  constructor(
    private postgresService: PostgresService,
    private mongoDbService: MongoDbService,
    private valkeyService: ValkeyService,
  ) {}

  // ── PostgreSQL ──

  @Post('postgres')
  @RequirePermissions('database:create')
  @ApiOperation({ summary: 'Create a managed PostgreSQL instance' })
  async createPostgres(@CurrentUser() user: RequestUser, @Body() body: CreatePostgresBodyDto) {
    return this.postgresService.create(user.tenantId, user.userId, body);
  }

  @Get('postgres')
  @RequirePermissions('database:read')
  @ApiOperation({ summary: 'List PostgreSQL instances' })
  async listPostgres(@CurrentUser() user: RequestUser) {
    return this.postgresService.list(user.tenantId);
  }

  @Get('postgres/:id')
  @RequirePermissions('database:read')
  @ApiOperation({ summary: 'Get PostgreSQL instance details' })
  async getPostgres(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.postgresService.get(user.tenantId, id);
  }

  @Patch('postgres/:id/scale')
  @RequirePermissions('database:update')
  @ApiOperation({ summary: 'Scale PostgreSQL instance' })
  async scalePostgres(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ScalePostgresBodyDto,
  ) {
    return this.postgresService.scale(user.tenantId, id, user.userId, body);
  }

  @Post('postgres/:id/backups')
  @RequirePermissions('database:create')
  @ApiOperation({ summary: 'Create a PostgreSQL backup' })
  async backupPostgres(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: BackupBodyDto,
  ) {
    return this.postgresService.createBackup(user.tenantId, id, user.userId, body.name);
  }

  @Get('postgres/:id/backups')
  @RequirePermissions('database:read')
  @ApiOperation({ summary: 'List PostgreSQL backups' })
  async listPostgresBackups(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.postgresService.listBackups(user.tenantId, id);
  }

  @Post('postgres/:id/restore')
  @RequirePermissions('database:update')
  @ApiOperation({ summary: 'Restore PostgreSQL from a backup' })
  async restorePostgres(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RestoreBodyDto,
  ) {
    return this.postgresService.restore(user.tenantId, id, user.userId, body.backupId);
  }

  @Delete('postgres/:id')
  @RequirePermissions('database:delete')
  @ApiOperation({ summary: 'Delete a PostgreSQL instance' })
  async deletePostgres(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.postgresService.delete(user.tenantId, id, user.userId);
  }

  // ── MongoDB ──

  @Post('mongodb')
  @RequirePermissions('database:create')
  @ApiOperation({ summary: 'Create a managed MongoDB instance' })
  async createMongo(@CurrentUser() user: RequestUser, @Body() body: CreateMongoDbBodyDto) {
    return this.mongoDbService.create(user.tenantId, user.userId, body);
  }

  @Get('mongodb')
  @RequirePermissions('database:read')
  @ApiOperation({ summary: 'List MongoDB instances' })
  async listMongo(@CurrentUser() user: RequestUser) {
    return this.mongoDbService.list(user.tenantId);
  }

  @Get('mongodb/:id')
  @RequirePermissions('database:read')
  @ApiOperation({ summary: 'Get MongoDB instance details' })
  async getMongo(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.mongoDbService.get(user.tenantId, id);
  }

  @Post('mongodb/:id/backups')
  @RequirePermissions('database:create')
  @ApiOperation({ summary: 'Create a MongoDB backup' })
  async backupMongo(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: BackupBodyDto,
  ) {
    return this.mongoDbService.createBackup(user.tenantId, id, user.userId, body.name);
  }

  @Get('mongodb/:id/backups')
  @RequirePermissions('database:read')
  @ApiOperation({ summary: 'List MongoDB backups' })
  async listMongoBackups(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.mongoDbService.listBackups(user.tenantId, id);
  }

  @Delete('mongodb/:id')
  @RequirePermissions('database:delete')
  @ApiOperation({ summary: 'Delete a MongoDB instance' })
  async deleteMongo(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.mongoDbService.delete(user.tenantId, id, user.userId);
  }

  // ── Valkey ──

  @Post('valkey')
  @RequirePermissions('database:create')
  @ApiOperation({ summary: 'Create a managed Valkey instance' })
  async createValkey(@CurrentUser() user: RequestUser, @Body() body: CreateValkeyBodyDto) {
    return this.valkeyService.create(user.tenantId, user.userId, body);
  }

  @Get('valkey')
  @RequirePermissions('database:read')
  @ApiOperation({ summary: 'List Valkey instances' })
  async listValkey(@CurrentUser() user: RequestUser) {
    return this.valkeyService.list(user.tenantId);
  }

  @Get('valkey/:id')
  @RequirePermissions('database:read')
  @ApiOperation({ summary: 'Get Valkey instance details' })
  async getValkey(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.valkeyService.get(user.tenantId, id);
  }

  @Patch('valkey/:id/config')
  @RequirePermissions('database:update')
  @ApiOperation({ summary: 'Update Valkey configuration' })
  async updateValkey(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateValkeyConfigBodyDto,
  ) {
    return this.valkeyService.updateConfig(user.tenantId, id, user.userId, body);
  }

  @Delete('valkey/:id')
  @RequirePermissions('database:delete')
  @ApiOperation({ summary: 'Delete a Valkey instance' })
  async deleteValkey(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.valkeyService.delete(user.tenantId, id, user.userId);
  }
}
