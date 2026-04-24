import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expectedApiKey = this.configService.get<string>('app.apiKey', '');
    if (!expectedApiKey) {
      this.logger.error('API key authentication is not configured');
      throw new UnauthorizedException(
        'API key authentication is not configured',
      );
    }

    const request = context
      .switchToHttp()
      .getRequest<{ headers?: Record<string, unknown> }>();
    const providedApiKey = this.getApiKeyFromHeaders(request.headers ?? {});

    if (!providedApiKey || providedApiKey !== expectedApiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }

  private getApiKeyFromHeaders(
    headers: Record<string, unknown>,
  ): string | undefined {
    const headerValue = headers['x-api-key'] ?? headers['X-API-KEY'];
    if (typeof headerValue === 'string') {
      return headerValue.trim();
    }

    if (Array.isArray(headerValue) && typeof headerValue[0] === 'string') {
      return headerValue[0].trim();
    }

    return undefined;
  }
}
