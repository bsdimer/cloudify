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
  IsInt,
  Min,
  Max,
  IsOptional,
  IsArray,
  IsIn,
  IsObject,
  IsBoolean,
} from 'class-validator';
import { ComputeService } from './compute.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PermissionsGuard } from '../iam/permissions.guard';
import { Roles, CurrentUser, type RequestUser } from '../auth/decorators';
import { RequirePermissions } from '../iam/decorators';
import { DEFAULT_VM_IMAGES, SUPPORTED_K8S_VERSIONS } from '@cloudify/common';

// ── DTOs ──

class CreateVmBodyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(128)
  cpus!: number;

  @IsInt()
  @Min(256)
  @Max(524288)
  memoryMb!: number;

  @IsInt()
  @Min(5)
  @Max(10240)
  diskGb!: number;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  networkBridge?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sshKeys?: string[];

  @IsOptional()
  @IsString()
  userData?: string;

  @IsOptional()
  @IsObject()
  tags?: Record<string, string>;

  @IsOptional()
  @IsIn(['spread', 'pack'])
  placementStrategy?: 'spread' | 'pack';

  @IsOptional()
  @IsString()
  preferredNode?: string;
}

class ResizeVmBodyDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(128)
  cpus?: number;

  @IsOptional()
  @IsInt()
  @Min(256)
  @Max(524288)
  memoryMb?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(10240)
  diskGb?: number;
}

class VmActionBodyDto {
  @IsIn(['start', 'stop', 'restart'])
  action!: 'start' | 'stop' | 'restart';

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

class CreateSnapshotBodyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

class RestoreSnapshotBodyDto {
  @IsString()
  snapshotName!: string;
}

// ── Controller ──

@ApiTags('compute')
@Controller('compute')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class ComputeController {
  constructor(private computeService: ComputeService) {}

  // ── VM Image Catalog ──

  @Get('images')
  @RequirePermissions('compute:read')
  @ApiOperation({ summary: 'List available VM images' })
  listImages() {
    return DEFAULT_VM_IMAGES;
  }

  @Get('k8s-versions')
  @RequirePermissions('compute:read')
  @ApiOperation({ summary: 'List supported Kubernetes versions' })
  listK8sVersions() {
    return SUPPORTED_K8S_VERSIONS;
  }

  // ── VMs ──

  @Post('vms')
  @Roles('member')
  @RequirePermissions('compute:create')
  @ApiOperation({ summary: 'Create a virtual machine' })
  async createVm(@CurrentUser() user: RequestUser, @Body() body: CreateVmBodyDto) {
    return this.computeService.createVm(user.tenantId, user.userId, body);
  }

  @Get('vms')
  @RequirePermissions('compute:read')
  @ApiOperation({ summary: 'List VMs for current tenant' })
  async listVms(@CurrentUser() user: RequestUser) {
    return this.computeService.listVms(user.tenantId);
  }

  @Get('vms/:id')
  @RequirePermissions('compute:read')
  @ApiOperation({ summary: 'Get VM details' })
  async getVm(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.computeService.getVm(user.tenantId, id);
  }

  @Post('vms/:id/action')
  @Roles('member')
  @RequirePermissions('compute:update')
  @ApiOperation({ summary: 'Perform VM action (start/stop/restart)' })
  async vmAction(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: VmActionBodyDto,
  ) {
    return this.computeService.vmAction(user.tenantId, id, user.userId, body.action, body.force);
  }

  @Patch('vms/:id/resize')
  @Roles('member')
  @RequirePermissions('compute:update')
  @ApiOperation({ summary: 'Resize a VM (CPU, memory, disk)' })
  async resizeVm(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResizeVmBodyDto,
  ) {
    return this.computeService.resizeVm(user.tenantId, id, user.userId, body);
  }

  @Delete('vms/:id')
  @Roles('member')
  @RequirePermissions('compute:delete')
  @ApiOperation({ summary: 'Delete a VM' })
  async deleteVm(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.computeService.deleteVm(user.tenantId, id, user.userId);
  }

  // ── Snapshots ──

  @Post('vms/:id/snapshots')
  @Roles('member')
  @RequirePermissions('compute:create')
  @ApiOperation({ summary: 'Create a VM snapshot' })
  async createSnapshot(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateSnapshotBodyDto,
  ) {
    return this.computeService.createSnapshot(
      user.tenantId,
      id,
      user.userId,
      body.name,
      body.description,
    );
  }

  @Post('vms/:id/snapshots/restore')
  @Roles('member')
  @RequirePermissions('compute:update')
  @ApiOperation({ summary: 'Restore a VM from snapshot' })
  async restoreSnapshot(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RestoreSnapshotBodyDto,
  ) {
    return this.computeService.restoreSnapshot(user.tenantId, id, user.userId, body.snapshotName);
  }
}
