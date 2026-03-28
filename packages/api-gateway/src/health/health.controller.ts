import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../auth/decorators';
import { DRIZZLE, type DrizzleDB } from '../database/database.module';
import { sql } from 'drizzle-orm';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check' })
  async check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.0.1',
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness check (includes DB connectivity)' })
  async ready() {
    try {
      await this.db.execute(sql`SELECT 1`);
      return {
        status: 'ready',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'not_ready',
        database: 'disconnected',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
