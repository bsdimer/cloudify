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
import { IsString, MinLength, MaxLength, IsArray, IsOptional, IsEmail } from 'class-validator';
import { IamService } from './iam.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PermissionsGuard } from './permissions.guard';
import { Roles, CurrentUser, type RequestUser } from '../auth/decorators';
import { RequirePermissions } from './decorators';

// ── DTOs ──

class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}

class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsArray()
  @IsString({ each: true })
  iamRoleIds!: string[];
}

class AssignRoleDto {
  @IsString()
  roleId!: string;
}

class CreateServiceAccountDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @IsString({ each: true })
  iamRoleIds!: string[];
}

// ── Controller ──

@ApiTags('iam')
@Controller('iam')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@ApiBearerAuth()
export class IamController {
  constructor(private iamService: IamService) {}

  // ── Roles ──

  @Post('roles')
  @Roles('admin')
  @RequirePermissions('iam:create')
  @ApiOperation({ summary: 'Create a custom IAM role' })
  async createRole(@CurrentUser() user: RequestUser, @Body() body: CreateRoleDto) {
    return this.iamService.createRole(user.tenantId, body);
  }

  @Get('roles')
  @RequirePermissions('iam:read')
  @ApiOperation({ summary: 'List IAM roles for current tenant' })
  async listRoles(@CurrentUser() user: RequestUser) {
    return this.iamService.listRoles(user.tenantId);
  }

  @Patch('roles/:id')
  @Roles('admin')
  @RequirePermissions('iam:update')
  @ApiOperation({ summary: 'Update a custom IAM role' })
  async updateRole(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRoleDto,
  ) {
    return this.iamService.updateRole(user.tenantId, id, body);
  }

  @Delete('roles/:id')
  @Roles('admin')
  @RequirePermissions('iam:delete')
  @ApiOperation({ summary: 'Delete a custom IAM role (not built-in)' })
  async deleteRole(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.iamService.deleteRole(user.tenantId, id);
  }

  // ── Users ──

  @Post('users/invite')
  @Roles('admin')
  @RequirePermissions('iam:manage')
  @ApiOperation({ summary: 'Invite a user to the tenant' })
  async inviteUser(@CurrentUser() user: RequestUser, @Body() body: InviteUserDto) {
    return this.iamService.inviteUser(user.tenantId, {
      email: body.email,
      iamRoleIds: body.iamRoleIds,
      invitedBy: user.userId,
    });
  }

  @Get('users')
  @RequirePermissions('iam:read')
  @ApiOperation({ summary: 'List tenant users with IAM roles' })
  async listUsers(@CurrentUser() user: RequestUser) {
    return this.iamService.listTenantUsers(user.tenantId);
  }

  @Patch('users/:id/roles')
  @Roles('admin')
  @RequirePermissions('iam:manage')
  @ApiOperation({ summary: 'Assign an IAM role to a user' })
  async assignRole(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() body: AssignRoleDto,
  ) {
    return this.iamService.assignRole(user.tenantId, userId, body.roleId, user.userId);
  }

  @Delete('users/:userId/roles/:roleId')
  @Roles('admin')
  @RequirePermissions('iam:manage')
  @ApiOperation({ summary: 'Revoke an IAM role from a user' })
  async revokeRole(
    @CurrentUser() user: RequestUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ) {
    return this.iamService.revokeRole(user.tenantId, userId, roleId);
  }

  @Delete('users/:id')
  @Roles('admin')
  @RequirePermissions('iam:manage')
  @ApiOperation({ summary: 'Remove a user from the tenant' })
  async removeUser(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) userId: string) {
    return this.iamService.removeUser(user.tenantId, userId);
  }

  // ── Service Accounts ──

  @Post('service-accounts')
  @Roles('admin')
  @RequirePermissions('iam:create')
  @ApiOperation({ summary: 'Create a service account' })
  async createServiceAccount(
    @CurrentUser() user: RequestUser,
    @Body() body: CreateServiceAccountDto,
  ) {
    return this.iamService.createServiceAccount(user.tenantId, {
      ...body,
      createdBy: user.userId,
    });
  }

  @Get('service-accounts')
  @RequirePermissions('iam:read')
  @ApiOperation({ summary: 'List service accounts for current tenant' })
  async listServiceAccounts(@CurrentUser() user: RequestUser) {
    return this.iamService.listServiceAccounts(user.tenantId);
  }

  @Post('service-accounts/:id/keys')
  @Roles('admin')
  @RequirePermissions('iam:manage')
  @ApiOperation({ summary: 'Issue an API key for a service account' })
  async issueKey(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.iamService.issueServiceAccountKey(user.tenantId, id);
  }

  @Delete('service-accounts/:id')
  @Roles('admin')
  @RequirePermissions('iam:delete')
  @ApiOperation({ summary: 'Delete a service account' })
  async deleteServiceAccount(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.iamService.deleteServiceAccount(user.tenantId, id);
  }
}
