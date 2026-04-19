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
  IsIn,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsArray,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ObjectStorageService } from './object-storage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PermissionsGuard } from '../iam/permissions.guard';
import { CurrentUser, type RequestUser } from '../auth/decorators';
import { RequirePermissions } from '../iam/decorators';

// ── DTOs ──

class LifecycleRuleDto {
  @IsString()
  id!: string;

  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  prefix?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  expirationDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  transitionDays?: number;

  @IsOptional()
  @IsString()
  transitionStorageClass?: string;
}

class CreateBucketBodyDto {
  @IsString()
  @MinLength(3)
  @MaxLength(63)
  name!: string;

  @IsOptional()
  @IsIn(['private', 'public-read', 'public-read-write'])
  access?: 'private' | 'public-read' | 'public-read-write';

  @IsOptional()
  @IsIn(['enabled', 'suspended', 'disabled'])
  versioning?: 'enabled' | 'suspended' | 'disabled';

  @IsOptional()
  @IsInt()
  @Min(1)
  quotaGb?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LifecycleRuleDto)
  lifecycleRules?: LifecycleRuleDto[];

  @IsOptional()
  @IsObject()
  tags?: Record<string, string>;
}

class UpdateAccessBodyDto {
  @IsIn(['private', 'public-read', 'public-read-write'])
  access!: 'private' | 'public-read' | 'public-read-write';
}

class UpdateVersioningBodyDto {
  @IsIn(['enabled', 'suspended', 'disabled'])
  versioning!: 'enabled' | 'suspended' | 'disabled';
}

class UpdateLifecycleBodyDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LifecycleRuleDto)
  rules!: LifecycleRuleDto[];
}

class CreateAccessKeyBodyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsBoolean()
  readOnly?: boolean;

  @IsOptional()
  @IsString()
  prefixRestriction?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

class PresignedUrlBodyDto {
  @IsString()
  bucketName!: string;

  @IsString()
  objectKey!: string;

  @IsIn(['GET', 'PUT', 'DELETE'])
  method!: 'GET' | 'PUT' | 'DELETE';

  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(604800)
  expirySeconds?: number;
}

// ── Controller ──

@ApiTags('object-storage')
@Controller('object-storage')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class ObjectStorageController {
  constructor(private objectStorageService: ObjectStorageService) {}

  // ── Buckets ──

  @Post('buckets')
  @RequirePermissions('storage:create')
  @ApiOperation({ summary: 'Create an object storage bucket' })
  async createBucket(@CurrentUser() user: RequestUser, @Body() body: CreateBucketBodyDto) {
    return this.objectStorageService.createBucket(user.tenantId, user.userId, body);
  }

  @Get('buckets')
  @RequirePermissions('storage:read')
  @ApiOperation({ summary: 'List buckets for current tenant' })
  async listBuckets(@CurrentUser() user: RequestUser) {
    return this.objectStorageService.listBuckets(user.tenantId);
  }

  @Get('buckets/:id')
  @RequirePermissions('storage:read')
  @ApiOperation({ summary: 'Get bucket details' })
  async getBucket(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.objectStorageService.getBucket(user.tenantId, id);
  }

  @Patch('buckets/:id/access')
  @RequirePermissions('storage:update')
  @ApiOperation({ summary: 'Update bucket access policy' })
  async updateAccess(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAccessBodyDto,
  ) {
    return this.objectStorageService.updateBucketAccess(
      user.tenantId,
      id,
      user.userId,
      body.access,
    );
  }

  @Patch('buckets/:id/versioning')
  @RequirePermissions('storage:update')
  @ApiOperation({ summary: 'Update bucket versioning' })
  async updateVersioning(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateVersioningBodyDto,
  ) {
    return this.objectStorageService.updateVersioning(
      user.tenantId,
      id,
      user.userId,
      body.versioning,
    );
  }

  @Patch('buckets/:id/lifecycle')
  @RequirePermissions('storage:update')
  @ApiOperation({ summary: 'Update bucket lifecycle rules' })
  async updateLifecycle(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateLifecycleBodyDto,
  ) {
    return this.objectStorageService.updateLifecycleRules(
      user.tenantId,
      id,
      user.userId,
      body.rules,
    );
  }

  @Delete('buckets/:id')
  @RequirePermissions('storage:delete')
  @ApiOperation({ summary: 'Delete a bucket' })
  async deleteBucket(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.objectStorageService.deleteBucket(user.tenantId, id, user.userId);
  }

  // ── Access Keys ──

  @Post('buckets/:id/access-keys')
  @RequirePermissions('storage:create')
  @ApiOperation({ summary: 'Issue an S3-compatible access key for a bucket' })
  async createAccessKey(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateAccessKeyBodyDto,
  ) {
    return this.objectStorageService.createAccessKey(user.tenantId, id, user.userId, body);
  }

  @Get('buckets/:id/access-keys')
  @RequirePermissions('storage:read')
  @ApiOperation({ summary: 'List access keys for a bucket' })
  async listAccessKeys(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.objectStorageService.listAccessKeys(user.tenantId, id);
  }

  @Delete('access-keys/:id')
  @RequirePermissions('storage:delete')
  @ApiOperation({ summary: 'Delete an access key' })
  async deleteAccessKey(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.objectStorageService.deleteAccessKey(user.tenantId, id, user.userId);
  }

  // ── Presigned URLs ──

  @Post('presigned-url')
  @RequirePermissions('storage:read')
  @ApiOperation({ summary: 'Generate a presigned URL for an object' })
  async presignedUrl(@CurrentUser() user: RequestUser, @Body() body: PresignedUrlBodyDto) {
    return this.objectStorageService.generatePresignedUrl(user.tenantId, body);
  }
}
