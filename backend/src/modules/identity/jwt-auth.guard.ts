import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Request } from "express";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.config.get("AUTH_ENABLED") === "false") {
      return true;
    }
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException({
        error: "UNAUTHORIZED",
        message: "Missing bearer token",
      });
    }
    const token = header.slice("Bearer ".length);
    const issuer = `${this.config.get("KEYCLOAK_URL")}/realms/${this.config.get("KEYCLOAK_REALM")}`;
    const audience = this.config.get<string>("KEYCLOAK_AUDIENCE") ?? "bet-transactions-api";
    this.jwks ??= createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));
    try {
      const { payload } = await jwtVerify(token, this.jwks, { issuer });
      const audiences = [payload.aud, payload.azp].flat().filter(Boolean);
      if (audiences.length > 0 && !audiences.includes(audience)) {
        throw new Error("audience mismatch");
      }
      return true;
    } catch {
      throw new UnauthorizedException({
        error: "UNAUTHORIZED",
        message: "Invalid access token",
      });
    }
  }
}
