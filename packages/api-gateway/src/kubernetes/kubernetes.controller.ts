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
  IsIn,
  IsArray,
  IsObject,
} from 'class-validator';
import { KubernetesService } from './kubernetes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PermissionsGuard } from '../iam/permissions.guard';
import { CurrentUser, type RequestUser } from '../auth/decorators';
import { RequirePermissions } from '../iam/decorators';

class CreateK8sClusterBodyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsString()
  version!: string;

  @IsIn([1, 3])
  controlPlaneCount!: 1 | 3;

  @IsInt()
  @Min(1)
  @Max(100)
  workerCount!: number;

  @IsInt()
  @Min(1)
  @Max(64)
  workerCpus!: number;

  @IsInt()
  @Min(1024)
  @Max(262144)
  workerMemoryMb!: number;

  @IsInt()
  @Min(20)
  @Max(2048)
  workerDiskGb!: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(64)
  controlPlaneCpus?: number;

  @IsOptional()
  @IsInt()
  @Min(2048)
  @Max(131072)
  controlPlaneMemoryMb?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(500)
  controlPlaneDiskGb?: number;

  @IsOptional()
  @IsIn(['cilium', 'calico'])
  cniPlugin?: 'cilium' | 'calico';

  @IsOptional()
  @IsString()
  podCidr?: string;

  @IsOptional()
  @IsString()
  serviceCidr?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sshKeys?: string[];

  @IsOptional()
  @IsObject()
  tags?: Record<string, string>;
}

class ScaleClusterBodyDto {
  @IsInt()
  @Min(1)
  @Max(100)
  workerCount!: number;
}

class UpgradeClusterBodyDto {
  @IsString()
  targetVersion!: string;
}

@ApiTags('kubernetes')
@Controller('kubernetes')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class KubernetesController {
  constructor(private k8sService: KubernetesService) {}

  @Post('clusters')
  @RequirePermissions('compute:create')
  @ApiOperation({ summary: 'Create a managed Kubernetes cluster' })
  async createCluster(@CurrentUser() user: RequestUser, @Body() body: CreateK8sClusterBodyDto) {
    return this.k8sService.createCluster(user.tenantId, user.userId, body);
  }

  @Get('clusters')
  @RequirePermissions('compute:read')
  @ApiOperation({ summary: 'List K8s clusters for current tenant' })
  async listClusters(@CurrentUser() user: RequestUser) {
    return this.k8sService.listClusters(user.tenantId);
  }

  @Get('clusters/:id')
  @RequirePermissions('compute:read')
  @ApiOperation({ summary: 'Get K8s cluster details' })
  async getCluster(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.k8sService.getCluster(user.tenantId, id);
  }

  @Patch('clusters/:id/scale')
  @RequirePermissions('compute:update')
  @ApiOperation({ summary: 'Scale K8s cluster worker nodes' })
  async scaleCluster(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ScaleClusterBodyDto,
  ) {
    return this.k8sService.scaleCluster(user.tenantId, id, user.userId, body.workerCount);
  }

  @Patch('clusters/:id/upgrade')
  @RequirePermissions('compute:update')
  @ApiOperation({ summary: 'Upgrade K8s cluster version' })
  async upgradeCluster(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpgradeClusterBodyDto,
  ) {
    return this.k8sService.upgradeCluster(user.tenantId, id, user.userId, body.targetVersion);
  }

  @Delete('clusters/:id')
  @RequirePermissions('compute:delete')
  @ApiOperation({ summary: 'Delete a K8s cluster' })
  async deleteCluster(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.k8sService.deleteCluster(user.tenantId, id, user.userId);
  }
}
