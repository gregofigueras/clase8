import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import {
  CursorCatalogo,
  codificarCursor,
  decodificarCursor,
} from '../common/pagination/cursor.util';
import {
  paginar,
} from '../common/pagination/paginacion.util';
import { ResultadoPaginado } from '../common/pagination/paginacion.dto';
import { ActualizarLibroDto } from './dto/actualizar-libro.dto';
import {
  ConsultarCatalogoCursorDto,
  ConsultarLibrosDto,
} from './dto/consultar-libros.dto';
import { CrearLibroDto } from './dto/crear-libro.dto';
import { Libro } from './entities/libro.entity';

export interface PaginaCursor<T> {
  datos: T[];
  metadatos: {
    limite: number;
    tieneSiguiente: boolean;
    siguienteCursor: string | null;
  };
}

interface FiltrosLibros {
  categoria?: string;
  anioDesde?: number;
  anioHasta?: number;
  texto?: string;
}

@Injectable()
export class LibrosService {
  constructor(
    @InjectRepository(Libro) private readonly repo: Repository<Libro>,
  ) {}

  create(dto: CrearLibroDto): Promise<Libro> {
    return this.repo.save(this.repo.create({ ...dto, disponibles: dto.ejemplares }));
  }

  async findAll(
    opciones: ConsultarLibrosDto,
  ): Promise<ResultadoPaginado<Libro>> {
    this.validarRangoAnios(opciones.anioDesde, opciones.anioHasta);
    const consulta = this.consultaFiltrada(
      this.repo.createQueryBuilder('libro'),
      opciones,
    );
    return paginar(consulta, opciones, {
      id: 'libro.id',
      titulo: 'libro.titulo',
      autor: 'libro.autor',
      categoria: 'libro.categoria',
      anio: 'libro.anio',
    });
  }

  async listarPorCursor(
    opciones: ConsultarCatalogoCursorDto,
  ): Promise<PaginaCursor<Libro>> {
    let cursor: CursorCatalogo;
    if (opciones.cursor !== undefined) {
      cursor = decodificarCursor(opciones.cursor);
      this.validarFiltrosCursor(opciones, cursor);
    } else {
      this.validarRangoAnios(opciones.anioDesde, opciones.anioHasta);
      const resultado = await this.repo
        .createQueryBuilder('libro')
        .select('MAX(libro.id)', 'maxId')
        .getRawOne<{ maxId: number | string | null }>();
      cursor = {
        version: 1,
        idMaximo: Number(resultado?.maxId ?? 0),
        ultimoTitulo: '',
        ultimoId: 0,
        categoria: opciones.categoria,
        anioDesde: opciones.anioDesde,
        anioHasta: opciones.anioHasta,
        texto: opciones.texto,
      };
    }

    const filtros = {
      categoria: cursor.categoria,
      anioDesde: cursor.anioDesde,
      anioHasta: cursor.anioHasta,
      texto: cursor.texto,
    };
    this.validarRangoAnios(filtros.anioDesde, filtros.anioHasta);
    let consulta = this.consultaFiltrada(
      this.repo.createQueryBuilder('libro'),
      filtros,
    ).andWhere('libro.id <= :idMaximo', {
      idMaximo: cursor.idMaximo,
    });

    if (cursor.ultimoId > 0) {
      consulta = consulta.andWhere(
        new Brackets((qb) => {
          qb.where('libro.titulo > :ultimoTitulo', {
            ultimoTitulo: cursor.ultimoTitulo,
          }).orWhere(
            '(libro.titulo = :ultimoTitulo AND libro.id > :ultimoId)',
            {
              ultimoTitulo: cursor.ultimoTitulo,
              ultimoId: cursor.ultimoId,
            },
          );
        }),
      );
    }

    const registros = await consulta
      .orderBy('libro.titulo', 'ASC')
      .addOrderBy('libro.id', 'ASC')
      .take(opciones.limite + 1)
      .getMany();
    const tieneSiguiente = registros.length > opciones.limite;
    const datos = registros.slice(0, opciones.limite);
    const ultimo = datos.at(-1);
    const siguienteCursor =
      tieneSiguiente && ultimo
        ? codificarCursor({
            ...cursor,
            ultimoTitulo: ultimo.titulo,
            ultimoId: ultimo.id,
          })
        : null;

    return {
      datos,
      metadatos: {
        limite: opciones.limite,
        tieneSiguiente,
        siguienteCursor,
      },
    };
  }

  async findOne(id: number): Promise<Libro> {
    const libro = await this.repo.findOneBy({ id });
    if (!libro) throw new NotFoundException(`El libro ${id} no existe`);
    return libro;
  }

  async update(id: number, dto: ActualizarLibroDto): Promise<Libro> {
    const libro = await this.findOne(id);
    return this.repo.save(Object.assign(libro, dto));
  }

  async remove(id: number): Promise<void> {
    const { affected } = await this.repo.delete(id);
    if (!affected) throw new NotFoundException(`El libro ${id} no existe`);
  }

  // Suma (o resta, si es negativo) ejemplares disponibles
  async ajustarDisponibles(id: number, delta: number): Promise<Libro> {
    const libro = await this.findOne(id);
    libro.disponibles += delta;
    return this.repo.save(libro);
  }

  private consultaFiltrada(
    consulta: SelectQueryBuilder<Libro>,
    filtros: FiltrosLibros,
  ): SelectQueryBuilder<Libro> {
    if (filtros.categoria) {
      consulta.andWhere('libro.categoria = :categoria', {
        categoria: filtros.categoria,
      });
    }
    if (filtros.anioDesde !== undefined) {
      consulta.andWhere('libro.anio >= :anioDesde', {
        anioDesde: filtros.anioDesde,
      });
    }
    if (filtros.anioHasta !== undefined) {
      consulta.andWhere('libro.anio <= :anioHasta', {
        anioHasta: filtros.anioHasta,
      });
    }
    if (filtros.texto) {
      consulta.andWhere(
        '(LOCATE(LOWER(:texto), LOWER(libro.titulo)) > 0 OR LOCATE(LOWER(:texto), LOWER(libro.autor)) > 0)',
        { texto: filtros.texto },
      );
    }
    return consulta;
  }

  private validarRangoAnios(
    anioDesde?: number,
    anioHasta?: number,
  ): void {
    if (anioDesde !== undefined && anioHasta !== undefined && anioDesde > anioHasta) {
      throw new BadRequestException(
        'anioDesde no puede ser mayor que anioHasta',
      );
    }
  }

  private validarFiltrosCursor(
    opciones: ConsultarCatalogoCursorDto,
    cursor: CursorCatalogo,
  ): void {
    const filtrosEnCursor = {
      categoria: cursor.categoria,
      anioDesde: cursor.anioDesde,
      anioHasta: cursor.anioHasta,
      texto: cursor.texto,
    };
    for (const [clave, valor] of Object.entries(filtrosEnCursor)) {
      const recibido = opciones[clave as keyof ConsultarCatalogoCursorDto];
      if (recibido !== undefined && recibido !== valor) {
        throw new BadRequestException(
          'No se pueden cambiar los filtros durante el recorrido del cursor',
        );
      }
    }
  }
}
