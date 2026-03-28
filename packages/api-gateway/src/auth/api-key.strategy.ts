import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { Request } from 'express';
import { AuthService } from './auth.service';

const API_KEY_HEADER = 'x-api-key';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(private authService: AuthService) {
    super();
  }

  async validate(req: Request) {
    const apiKey = req.headers[API_KEY_HEADER] as string;

    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }

    const keyData = await this.authService.validateApiKey(apiKey);

    return {
      userId: keyData.userId,
      tenantId: keyData.tenantId,
      scopes: keyData.scopes,
      role: 'member', // API keys get member-level access by default
      isApiKey: true,
    };
  }
}
