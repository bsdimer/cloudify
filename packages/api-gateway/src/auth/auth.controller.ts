import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsArray, IsOptional } from 'class-validator';
import { AuthService } from './auth.service';
import { Public, CurrentUser } from './decorators';
import { JwtAuthGuard } from './jwt-auth.guard';

class LoginBodyDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

class RefreshBodyDto {
  @IsString()
  refreshToken!: string;
}

class CreateApiKeyBodyDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsArray()
  @IsString({ each: true })
  scopes!: string[];

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

interface AuthenticatedUser {
  userId: string;
  email: string;
  tenantId: string;
  role: string;
  jti?: string;
  exp?: number;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() body: LoginBodyDto) {
    return this.authService.login(body.email, body.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Body() body: RefreshBodyDto) {
    return this.authService.refreshToken(body.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and revoke current token' })
  async logout(@CurrentUser() user: AuthenticatedUser) {
    if (user.jti && user.exp) {
      await this.authService.logout(user.jti, user.userId, user.exp);
    }
    return { message: 'Logged out successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('api-keys')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new API key' })
  async createApiKey(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateApiKeyBodyDto) {
    return this.authService.createApiKey(user.userId, user.tenantId, body.name, body.scopes);
  }
}
