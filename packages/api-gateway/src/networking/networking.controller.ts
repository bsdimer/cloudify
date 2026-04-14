import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NetworkingService } from './networking.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PermissionsGuard } from '../iam/permissions.guard';
import { CurrentUser, type RequestUser } from '../auth/decorators';
import { RequirePermissions } from '../iam/decorators';

// ── DTOs ──

class CreateVpcBodyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  cidr!: string;
}

class CreateSubnetBodyDto {
  @IsString()
  vpcId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsString()
  cidr!: string;

  @IsOptional()
  @IsString()
  gateway?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dnsServers?: string[];

  @IsOptional()
  @IsBoolean()
  dhcpEnabled?: boolean;
}

class SecurityRuleDto {
  @IsIn(['ingress', 'egress'])
  direction!: 'ingress' | 'egress';

  @IsIn(['tcp', 'udp', 'icmp', 'any'])
  protocol!: 'tcp' | 'udp' | 'icmp' | 'any';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  portRangeMin?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  portRangeMax?: number;

  @IsOptional()
  @IsString()
  remoteCidr?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class CreateSecurityGroupBodyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  vpcId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SecurityRuleDto)
  rules!: SecurityRuleDto[];
}

class UpdateSecurityGroupRulesBodyDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SecurityRuleDto)
  rules!: SecurityRuleDto[];
}

// ── Controller ──

@ApiTags('networking')
@Controller('networking')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class NetworkingController {
  constructor(private networkingService: NetworkingService) {}

  // ── VPCs ──

  @Post('vpcs')
  @RequirePermissions('network:create')
  @ApiOperation({ summary: 'Create a VPC (Virtual Private Cloud)' })
  async createVpc(@CurrentUser() user: RequestUser, @Body() body: CreateVpcBodyDto) {
    return this.networkingService.createVpc(user.tenantId, user.userId, body);
  }

  @Get('vpcs')
  @RequirePermissions('network:read')
  @ApiOperation({ summary: 'List VPCs for current tenant' })
  async listVpcs(@CurrentUser() user: RequestUser) {
    return this.networkingService.listVpcs(user.tenantId);
  }

  @Get('vpcs/:id')
  @RequirePermissions('network:read')
  @ApiOperation({ summary: 'Get VPC details' })
  async getVpc(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.networkingService.getVpc(user.tenantId, id);
  }

  @Delete('vpcs/:id')
  @RequirePermissions('network:delete')
  @ApiOperation({ summary: 'Delete a VPC' })
  async deleteVpc(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.networkingService.deleteVpc(user.tenantId, id, user.userId);
  }

  // ── Subnets ──

  @Post('subnets')
  @RequirePermissions('network:create')
  @ApiOperation({ summary: 'Create a subnet within a VPC' })
  async createSubnet(@CurrentUser() user: RequestUser, @Body() body: CreateSubnetBodyDto) {
    return this.networkingService.createSubnet(user.tenantId, user.userId, body);
  }

  @Get('subnets')
  @RequirePermissions('network:read')
  @ApiOperation({ summary: 'List subnets in a VPC' })
  async listSubnets(
    @CurrentUser() user: RequestUser,
    @Query('vpcId', ParseUUIDPipe) vpcId: string,
  ) {
    return this.networkingService.listSubnets(user.tenantId, vpcId);
  }

  @Delete('subnets/:id')
  @RequirePermissions('network:delete')
  @ApiOperation({ summary: 'Delete a subnet' })
  async deleteSubnet(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.networkingService.deleteSubnet(user.tenantId, id, user.userId);
  }

  // ── Security Groups ──

  @Post('security-groups')
  @RequirePermissions('network:create')
  @ApiOperation({ summary: 'Create a security group' })
  async createSecurityGroup(
    @CurrentUser() user: RequestUser,
    @Body() body: CreateSecurityGroupBodyDto,
  ) {
    return this.networkingService.createSecurityGroup(user.tenantId, user.userId, body);
  }

  @Get('security-groups')
  @RequirePermissions('network:read')
  @ApiOperation({ summary: 'List security groups in a VPC' })
  async listSecurityGroups(
    @CurrentUser() user: RequestUser,
    @Query('vpcId', ParseUUIDPipe) vpcId: string,
  ) {
    return this.networkingService.listSecurityGroups(user.tenantId, vpcId);
  }

  @Patch('security-groups/:id/rules')
  @RequirePermissions('network:update')
  @ApiOperation({ summary: 'Update security group rules' })
  async updateSecurityGroupRules(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSecurityGroupRulesBodyDto,
  ) {
    return this.networkingService.updateSecurityGroupRules(
      user.tenantId,
      id,
      user.userId,
      body.rules,
    );
  }

  @Delete('security-groups/:id')
  @RequirePermissions('network:delete')
  @ApiOperation({ summary: 'Delete a security group' })
  async deleteSecurityGroup(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.networkingService.deleteSecurityGroup(user.tenantId, id, user.userId);
  }
}
