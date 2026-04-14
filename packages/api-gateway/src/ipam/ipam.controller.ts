import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength, IsOptional, IsIn, IsInt, Min, Max } from 'class-validator';
import { IpamService } from './ipam.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PermissionsGuard } from '../iam/permissions.guard';
import { Roles, CurrentUser, type RequestUser } from '../auth/decorators';
import { RequirePermissions } from '../iam/decorators';

// ── DTOs ──

class CreateIpPoolBodyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsString()
  cidr!: string;

  @IsIn([4, 6])
  version!: 4 | 6;

  @IsOptional()
  @IsString()
  gateway?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

class AllocateIpBodyDto {
  @IsString()
  poolId!: string;

  @IsIn(['floating', 'ephemeral', 'private'])
  type!: 'floating' | 'ephemeral' | 'private';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

class AssignIpBodyDto {
  @IsString()
  resourceId!: string;
}

// ── Controller ──

@ApiTags('ipam')
@Controller('ips')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class IpamController {
  constructor(private ipamService: IpamService) {}

  // ── IP Pools (admin/super_admin only) ──

  @Post('pools')
  @Roles('super_admin')
  @ApiOperation({ summary: 'Create an IP pool (platform admin)' })
  async createPool(@Body() body: CreateIpPoolBodyDto) {
    return this.ipamService.createPool(body);
  }

  @Get('pools')
  @Roles('admin')
  @ApiOperation({ summary: 'List IP pools' })
  async listPools() {
    return this.ipamService.listPools();
  }

  @Get('pools/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Get IP pool details' })
  async getPool(@Param('id', ParseUUIDPipe) id: string) {
    return this.ipamService.getPool(id);
  }

  @Delete('pools/:id')
  @Roles('super_admin')
  @ApiOperation({ summary: 'Delete an IP pool (platform admin)' })
  async deletePool(@Param('id', ParseUUIDPipe) id: string) {
    return this.ipamService.deletePool(id);
  }

  // ── IP Allocation (per-tenant) ──

  @Post('allocate')
  @RequirePermissions('network:create')
  @ApiOperation({ summary: 'Allocate an IP address from a pool' })
  async allocateIp(@CurrentUser() user: RequestUser, @Body() body: AllocateIpBodyDto) {
    return this.ipamService.allocateIp(user.tenantId, user.userId, body);
  }

  @Post('release/:id')
  @RequirePermissions('network:delete')
  @ApiOperation({ summary: 'Release an allocated IP address' })
  async releaseIp(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ipamService.releaseIp(user.tenantId, id, user.userId);
  }

  @Post('assign/:id')
  @RequirePermissions('network:update')
  @ApiOperation({ summary: 'Assign an IP to a resource (floating IP)' })
  async assignIp(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignIpBodyDto,
  ) {
    return this.ipamService.assignIp(user.tenantId, id, body.resourceId, user.userId);
  }

  @Get('allocations')
  @RequirePermissions('network:read')
  @ApiOperation({ summary: 'List IP allocations for current tenant' })
  async listAllocations(@CurrentUser() user: RequestUser) {
    return this.ipamService.listAllocations(user.tenantId);
  }
}
