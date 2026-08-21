import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiKeyService, type ApiScope } from "./api-key.service";

export const API_SCOPE_KEY = "apiScope";

/** Endpoint qaysi bo'limga tegishli ekanini belgilaydi (hr / letters / documents). */
export const ApiScopeRequired = (scope: ApiScope) => SetMetadata(API_SCOPE_KEY, scope);

/**
 * Tashqi tizimlar uchun himoya: X-API-Key sarlavhasini tekshiradi
 * va kalitga berilgan ruxsatlar (scope) bilan solishtiradi.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private apiKeyService: ApiKeyService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const rawKey = request.headers["x-api-key"] ?? request.query?.api_key;

    const client = await this.apiKeyService.validate(String(rawKey ?? ""));

    const required = this.reflector.getAllAndOverride<ApiScope>(API_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !client.scopes.includes(required)) {
      throw new ForbiddenException(`Bu kalitda "${required}" bo'limiga ruxsat yo'q.`);
    }

    request.apiClient = client;
    return true;
  }
}
