import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import type { UsuarioAutenticado } from '../autenticacion/usuario-autenticado';
import { Roles } from '../autenticacion/roles.decorator';
import { RolGuard } from '../autenticacion/rol.guard';
import { CrearPrestamoDto } from './dto/crear-prestamo.dto';
import { PrestamosService } from './prestamos.service';

@Controller('prestamos')
export class PrestamosController {
  constructor(private readonly service: PrestamosService) {}

  @Post()
  prestar(
    @Body() dto: CrearPrestamoDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.service.prestar(dto, usuario.id);
  }

  @Get()
  listar(@CurrentUser() usuario: UsuarioAutenticado) {
    return usuario.rol === 'bibliotecario'
      ? this.service.listar()
      : this.service.listarPorSocio(usuario.id);
  }

  @Get('vencidos')
  @Roles('bibliotecario')
  @UseGuards(RolGuard)
  vencidos() {
    return this.service.listarVencidos();
  }

  @Get(':id')
  obtener(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return usuario.rol === 'bibliotecario'
      ? this.service.obtener(id)
      : this.service.obtenerPorSocio(id, usuario.id);
  }

  @Post(':id/devolucion')
  @HttpCode(200)
  devolver(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return usuario.rol === 'bibliotecario'
      ? this.service.devolver(id)
      : this.service.devolverPorSocio(id, usuario.id);
  }
}
