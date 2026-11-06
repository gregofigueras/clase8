import { BadRequestException } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { PaginacionDto } from './paginacion.dto';
import { codificarCursor, decodificarCursor } from './cursor.util';
import { paginar } from './paginacion.util';

describe('paginación reutilizable', () => {
  it('aplica desplazamiento, orden determinista y metadatos', async () => {
    const registros = [{ id: 2 }, { id: 3 }];
    const consulta = {
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([registros, 5]),
    } as unknown as SelectQueryBuilder<{ id: number }>;
    const opciones = Object.assign(new PaginacionDto(), {
      pagina: 2,
      limite: 2,
      ordenarPor: 'nombre',
      direccion: 'desc' as const,
    });

    const resultado = await paginar(consulta, opciones, {
      id: 'socio.id',
      nombre: 'socio.nombre',
    });

    expect(consulta.orderBy).toHaveBeenCalledWith('socio.nombre', 'DESC');
    expect(consulta.addOrderBy).toHaveBeenCalledWith('socio.id', 'DESC');
    expect(consulta.skip).toHaveBeenCalledWith(2);
    expect(consulta.take).toHaveBeenCalledWith(2);
    expect(resultado).toEqual({
      datos: registros,
      metadatos: {
        pagina: 2,
        limite: 2,
        total: 5,
        paginas: 3,
        tieneAnterior: true,
        tieneSiguiente: true,
      },
    });
  });

  it('no repite la columna id como clave de desempate', async () => {
    const consulta = {
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    } as unknown as SelectQueryBuilder<{ id: number }>;

    const resultado = await paginar(
      consulta,
      new PaginacionDto(),
      { id: 'libro.id' },
    );

    expect(consulta.orderBy).toHaveBeenCalledWith('libro.id', 'ASC');
    expect(consulta.addOrderBy).not.toHaveBeenCalled();
    expect(resultado.metadatos).toEqual({
      pagina: 1,
      limite: 20,
      total: 0,
      paginas: 0,
      tieneAnterior: false,
      tieneSiguiente: false,
    });
  });

  it('codifica y valida un cursor opaco con título repetido', () => {
    const original = {
      version: 1 as const,
      idMaximo: 50,
      ultimoTitulo: 'Historia',
      ultimoId: 12,
      categoria: 'historia',
    };

    expect(decodificarCursor(codificarCursor(original))).toEqual(original);
  });

  it.each(['no-es-un-cursor', Buffer.from('{}').toString('base64url')])(
    'rechaza un cursor inválido',
    (cursor) => {
      expect(() => decodificarCursor(cursor)).toThrow(BadRequestException);
    },
  );
});
