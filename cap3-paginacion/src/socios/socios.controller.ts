import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CrearSocioDto } from './dto/crear-socio.dto';
import { ConsultarSociosDto } from './dto/consultar-socios.dto';
import { SociosService } from './socios.service';

@Controller('socios')
export class SociosController {
  constructor(private readonly service: SociosService) {}

  @Post()
  create(@Body() dto: CrearSocioDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() opciones: ConsultarSociosDto) {
    return this.service.findAll(opciones);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
}
