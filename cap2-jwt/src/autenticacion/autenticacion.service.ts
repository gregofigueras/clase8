import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  RefreshTokenError,
  TokenService,
  type TokenPair,
} from '@nestjs/authentication';
import { SociosService } from '../socios/socios.service';
import type { SocioPublico } from '../socios/socios.service';

interface Sesion {
  usuarioId: number;
  activa: boolean;
}

@Injectable()
export class AutenticacionService {
  private readonly sesiones = new Map<string, Sesion>();
  private readonly sesionesPorRefresh = new Map<string, string>();

  constructor(
    private readonly socios: SociosService,
    private readonly tokens: TokenService,
  ) {}

  async iniciarSesion(email: string, password: string): Promise<TokenPair> {
    const socio = await this.socios.verificarCredenciales(email, password);
    if (!socio) throw new UnauthorizedException('Credenciales inválidas');
    return this.emitirTokens(socio);
  }

  async refrescar(refreshToken: string): Promise<TokenPair> {
    const sessionId = this.sesionesPorRefresh.get(this.hash(refreshToken));
    try {
      const resultado = await this.tokens.refresh(refreshToken);
      if (!sessionId) {
        await this.tokens.revoke(resultado.refreshToken);
        throw new UnauthorizedException('Refresh token inválido');
      }

      const sesion = this.sesiones.get(sessionId);
      if (!sesion?.activa) {
        await this.tokens.revoke(resultado.refreshToken);
        throw new UnauthorizedException('La sesión ya fue cerrada');
      }
      this.sesionesPorRefresh.set(
        this.hash(resultado.refreshToken),
        sessionId,
      );
      return resultado;
    } catch (error) {
      if (error instanceof RefreshTokenError && sessionId) {
        const sesion = this.sesiones.get(sessionId);
        if (sesion) sesion.activa = false;
        throw new UnauthorizedException('Refresh token inválido');
      }
      throw error;
    }
  }

  async cerrarDispositivo(
    usuarioId: number,
    sessionId: string,
    refreshToken: string,
  ): Promise<void> {
    const tokenSessionId = this.sesionesPorRefresh.get(this.hash(refreshToken));
    const sesion = this.sesiones.get(sessionId);
    if (
      tokenSessionId !== sessionId ||
      !sesion ||
      sesion.usuarioId !== usuarioId
    ) {
      throw new UnauthorizedException('Refresh token inválido');
    }
    await this.tokens.revoke(refreshToken);
    sesion.activa = false;
  }

  async cerrarTodas(usuarioId: number): Promise<void> {
    await this.tokens.revokeAll(String(usuarioId));
    for (const sesion of this.sesiones.values()) {
      if (sesion.usuarioId === usuarioId) sesion.activa = false;
    }
  }

  sesionActiva(sessionId: string, usuarioId: number): boolean {
    const sesion = this.sesiones.get(sessionId);
    return sesion?.activa === true && sesion.usuarioId === usuarioId;
  }

  private async emitirTokens(socio: SocioPublico): Promise<TokenPair> {
    const sessionId = randomUUID();
    const resultado = await this.tokens.issue(String(socio.id), {
      claims: { email: socio.email, role: socio.rol, sid: sessionId },
      method: 'password',
    });
    if (!('refreshToken' in resultado)) {
      throw new Error('El refresco de tokens debe estar habilitado');
    }
    this.sesiones.set(sessionId, { usuarioId: socio.id, activa: true });
    this.sesionesPorRefresh.set(this.hash(resultado.refreshToken), sessionId);
    return resultado;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
