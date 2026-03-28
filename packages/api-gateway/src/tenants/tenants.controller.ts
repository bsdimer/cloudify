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
import { IsString, MinLength, MaxLength, IsEmail, Matches, IsOptional } from 'class-validator';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles, Public, CurrentUser, type RequestUser } from '../auth/decorators';
// Tenant status values matching the DB enum
const TENANT_STATUSES = ['active', 'suspended', 'pending', 'decommissioned'] as const;
type TenantStatusType = (typeof TENANT_STATUSES)[number];

class CreateTenantBodyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(128)
  @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message: 'Slug must be lowercase alphanumeric with hyphens, not starting/ending with a hyphen',
  })
  slug!: string;

  @IsEmail()
  ownerEmail!: string;

  @IsString()
  @MinLength(8)
  ownerPassword!: string;
}

class UpdateTenantBodyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  status?: 'active' | 'suspended' | 'pending' | 'decommissioned';
}

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private tenantsService: TenantsService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Create a new tenant (sign up)' })
  async create(@Body() body: CreateTenantBodyDto) {
    return this.tenantsService.create(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all tenants (admin only)' })
  async findAll(@Query('page') page?: string, @Query('perPage') perPage?: string) {
    return this.tenantsService.findAll(
      page ? parseInt(page, 10) : 1,
      perPage ? parseInt(perPage, 10) : 20,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current user's tenant" })
  async findMyTenant(@CurrentUser() user: RequestUser) {
    return this.tenantsService.findById(user.tenantId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get tenant by ID' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.findById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update tenant' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateTenantBodyDto) {
    return this.tenantsService.update(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Decommission tenant' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantsService.delete(id);
  }
}
