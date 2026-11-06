import { Injectable } from '@nestjs/common';
import {
  AuthenticationRegistry,
  JwtBearerProvider,
  type JwtClaims,
} from '@nestjs/authentication';
import { AutenticacionService } from './autenticacion.service';
import { SociosService } from '../socios/socios.service';
import type { UsuarioAutenticado } from './usuario-autenticado';

@Injectable()
export class JwtAuthProvider extends JwtBearerProvider<UsuarioAutenticado> {
  constructor(
    private readonly socios: SociosService,
    private readonly autenticacion: AutenticacionService,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerProvider(this);
  }

  protected async validate(
    claims: JwtClaims,
  ): Promise<UsuarioAutenticado | null> {
    const id = Number(claims.sub);
    const sessionId = claims.sid;
    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      typeof sessionId !== 'string' ||
      !this.autenticacion.sesionActiva(sessionId, id)
    ) {
      return null;
    }

    const socio = this.socios.buscarParaAutenticacion(id);
    if (!socio) return null;
    return {
      id: socio.id,
      email: socio.email,
      rol: socio.rol,
      sessionId,
    };
  }
}
