import { TenantStatus, UserRole } from './enums';

// ── Tenant DTOs ──

export interface CreateTenantDto {
  name: string;
  slug: string;
  ownerEmail: string;
  ownerPassword: string;
}

export interface UpdateTenantDto {
  name?: string;
  status?: TenantStatus;
}

// ── User DTOs ──

export interface CreateUserDto {
  email: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserDto {
  email?: string;
  role?: UserRole;
}

// ── Auth DTOs ──

export interface LoginDto {
  email: string;
  password: string;
}

export interface TokenResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshTokenDto {
  refreshToken: string;
}

// ── API Key DTOs ──

export interface CreateApiKeyDto {
  name: string;
  scopes: string[];
  expiresAt?: string; // ISO date string
}

export interface ApiKeyResponseDto {
  id: string;
  name: string;
  key: string; // Only returned on creation
  scopes: string[];
  expiresAt: string | null;
  createdAt: string;
}
