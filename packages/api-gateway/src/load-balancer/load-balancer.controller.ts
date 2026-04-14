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
  IsArray,
  ValidateNested,
  IsIn,
  IsInt,
  Min,
  Max,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LoadBalancerService } from './load-balancer.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PermissionsGuard } from '../iam/permissions.guard';
import { CurrentUser, type RequestUser } from '../auth/decorators';
import { RequirePermissions } from '../iam/decorators';

// ── DTOs ──

class HealthCheckDto {
  @IsIn(['tcp', 'http'])
  protocol!: 'tcp' | 'http';

  @IsOptional()
  @IsString()
  path?: string;

  @IsInt()
  @Min(5)
  @Max(300)
  intervalSeconds!: number;

  @IsInt()
  @Min(1)
  @Max(60)
  timeoutSeconds!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  unhealthyThreshold!: number;
}

class LbBackendBodyDto {
  @IsString()
  address!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(256)
  weight?: number;
}

class CreateLoadBalancerBodyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsString()
  vpcId!: string;

  @IsIn(['tcp', 'http', 'https'])
  protocol!: 'tcp' | 'http' | 'https';

  @IsInt()
  @Min(1)
  @Max(65535)
  frontendPort!: number;

  @IsInt()
  @Min(1)
  @Max(65535)
  backendPort!: number;

  @IsOptional()
  @IsIn(['roundrobin', 'leastconn', 'source'])
  algorithm?: 'roundrobin' | 'leastconn' | 'source';

  @IsOptional()
  @ValidateNested()
  @Type(() => HealthCheckDto)
  healthCheck?: HealthCheckDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LbBackendBodyDto)
  backends!: LbBackendBodyDto[];
}

class UpdateBackendsBodyDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LbBackendBodyDto)
  backends!: LbBackendBodyDto[];
}

// ── Controller ──

@ApiTags('load-balancers')
@Controller('load-balancers')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class LoadBalancerController {
  constructor(private lbService: LoadBalancerService) {}

  @Post()
  @RequirePermissions('network:create')
  @ApiOperation({ summary: 'Create a load balancer' })
  async create(@CurrentUser() user: RequestUser, @Body() body: CreateLoadBalancerBodyDto) {
    return this.lbService.create(user.tenantId, user.userId, body);
  }

  @Get()
  @RequirePermissions('network:read')
  @ApiOperation({ summary: 'List load balancers for current tenant' })
  async list(@CurrentUser() user: RequestUser) {
    return this.lbService.list(user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('network:read')
  @ApiOperation({ summary: 'Get load balancer details' })
  async get(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.lbService.get(user.tenantId, id);
  }

  @Patch(':id/backends')
  @RequirePermissions('network:update')
  @ApiOperation({ summary: 'Update load balancer backends' })
  async updateBackends(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateBackendsBodyDto,
  ) {
    return this.lbService.updateBackends(user.tenantId, id, user.userId, body.backends);
  }

  @Delete(':id')
  @RequirePermissions('network:delete')
  @ApiOperation({ summary: 'Delete a load balancer' })
  async remove(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.lbService.remove(user.tenantId, id, user.userId);
  }
}
