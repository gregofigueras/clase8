import {
  Body,
  Controller,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Authenticate,
  CurrentUser,
  Public,
} from '@nestjs/authentication';
import { AutenticacionService } from './autenticacion.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import type { UsuarioAutenticado } from './usuario-autenticado';

@Controller('auth')
export class AutenticacionController {
  constructor(private readonly autenticacion: AutenticacionService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.autenticacion.iniciarSesion(dto.email, dto.password);
  }

  @Post('refresh')
  @Authenticate({ optional: true })
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    if (!dto.refreshToken) {
      throw new UnauthorizedException('Refresh token requerido');
    }
    return this.autenticacion.refrescar(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body() dto: RefreshDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.autenticacion.cerrarDispositivo(
      usuario.id,
      usuario.sessionId,
      dto.refreshToken,
    );
  }

  @Post('logout-todos')
  @HttpCode(204)
  async logoutTodos(
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<void> {
    await this.autenticacion.cerrarTodas(usuario.id);
  }
}
