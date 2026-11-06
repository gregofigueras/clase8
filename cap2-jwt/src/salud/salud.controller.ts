import { Controller, Get } from '@nestjs/common';
import { Public } from '@nestjs/authentication';

@Controller('salud')
export class SaludController {
  @Get()
  @Public()
  estado() {
    return { estado: 'ok', instancia: process.env.INSTANCIA ?? 'local' };
  }
}
