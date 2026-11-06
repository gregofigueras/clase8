import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { paginar } from '../common/pagination/paginacion.util';
import { ResultadoPaginado } from '../common/pagination/paginacion.dto';
import { LibrosService } from '../libros/libros.service';
import { SociosService } from '../socios/socios.service';
import { CrearPrestamoDto } from './dto/crear-prestamo.dto';
import { Prestamo } from './entities/prestamo.entity';
import { ConsultarPrestamosDto } from './dto/consultar-prestamos.dto';
import {
  DIA_MS,
  MAX_PRESTAMOS_ACTIVOS,
  MULTA_POR_DIA,
  PLAZO_POR_DEFECTO_DIAS,
} from './prestamos.constantes';

@Injectable()
export class PrestamosService {
  constructor(
    @InjectRepository(Prestamo) private readonly repo: Repository<Prestamo>,
    private readonly libros: LibrosService,
    private readonly socios: SociosService,
  ) {}

  async prestar(dto: CrearPrestamoDto): Promise<Prestamo> {
    const libro = await this.libros.findOne(dto.libroId);
    await this.socios.findOne(dto.socioId);

    if (libro.disponibles <= 0) {
      throw new ConflictException('No hay ejemplares disponibles');
    }
    const activos = await this.repo.countBy({
      socioId: dto.socioId,
      devueltoEn: IsNull(),
    });
    if (activos >= MAX_PRESTAMOS_ACTIVOS) {
      throw new ConflictException('El socio alcanzó el máximo de préstamos');
    }

    const ahora = new Date();
    const plazo = dto.dias ?? PLAZO_POR_DEFECTO_DIAS;
    await this.libros.ajustarDisponibles(libro.id, -1);
    return this.repo.save(
      this.repo.create({
        libroId: libro.id,
        socioId: dto.socioId,
        prestadoEn: ahora,
        vencimiento: new Date(ahora.getTime() + plazo * DIA_MS),
        devueltoEn: null,
        multa: 0,
      }),
    );
  }

  async devolver(id: number): Promise<Prestamo> {
    const prestamo = await this.obtener(id);
    if (prestamo.devueltoEn !== null) {
      throw new ConflictException('El préstamo ya fue devuelto');
    }

    const ahora = new Date();
    const atrasoMs = ahora.getTime() - prestamo.vencimiento.getTime();
    const diasDeAtraso = Math.max(0, Math.ceil(atrasoMs / DIA_MS));

    prestamo.devueltoEn = ahora;
    prestamo.multa = diasDeAtraso * MULTA_POR_DIA;
    await this.libros.ajustarDisponibles(prestamo.libroId, 1);
    return this.repo.save(prestamo);
  }

  async obtener(id: number): Promise<Prestamo> {
    const prestamo = await this.repo.findOneBy({ id });
    if (!prestamo) throw new NotFoundException(`El préstamo ${id} no existe`);
    return prestamo;
  }

  listar(
    opciones: ConsultarPrestamosDto,
  ): Promise<ResultadoPaginado<Prestamo>> {
    const consulta = this.repo.createQueryBuilder('prestamo');
    this.filtrarConsulta(consulta, opciones);
    return paginar(consulta, opciones, {
      id: 'prestamo.id',
      libroId: 'prestamo.libroId',
      socioId: 'prestamo.socioId',
      prestadoEn: 'prestamo.prestadoEn',
      vencimiento: 'prestamo.vencimiento',
      devueltoEn: 'prestamo.devueltoEn',
      multa: 'prestamo.multa',
    });
  }

  listarVencidos(
    opciones: ConsultarPrestamosDto,
  ): Promise<ResultadoPaginado<Prestamo>> {
    const consulta = this.repo
      .createQueryBuilder('prestamo')
      .where('prestamo.devueltoEn IS NULL')
      .andWhere('prestamo.vencimiento < :ahora', { ahora: new Date() });
    this.filtrarConsulta(consulta, opciones);
    return paginar(consulta, opciones, {
      id: 'prestamo.id',
      libroId: 'prestamo.libroId',
      socioId: 'prestamo.socioId',
      prestadoEn: 'prestamo.prestadoEn',
      vencimiento: 'prestamo.vencimiento',
      devueltoEn: 'prestamo.devueltoEn',
      multa: 'prestamo.multa',
    });
  }

  private filtrarConsulta(
    consulta: ReturnType<Repository<Prestamo>['createQueryBuilder']>,
    opciones: ConsultarPrestamosDto,
  ): void {
    if (opciones.socioId !== undefined) {
      consulta.andWhere('prestamo.socioId = :socioId', {
        socioId: opciones.socioId,
      });
    }
    const ahora = new Date();
    switch (opciones.estado) {
      case 'activo':
        consulta
          .andWhere('prestamo.devueltoEn IS NULL')
          .andWhere('prestamo.vencimiento >= :ahora', { ahora });
        break;
      case 'devuelto':
        consulta.andWhere('prestamo.devueltoEn IS NOT NULL');
        break;
      case 'vencido':
        consulta
          .andWhere('prestamo.devueltoEn IS NULL')
          .andWhere('prestamo.vencimiento < :ahora', { ahora });
        break;
    }
  }
}
