import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Libro } from '../libros/entities/libro.entity';
import { LibrosService } from '../libros/libros.service';
import { Socio } from '../socios/entities/socio.entity';
import { SociosService } from '../socios/socios.service';
import { Prestamo } from './entities/prestamo.entity';
import { PrestamosRepository } from './prestamos.repository';
import { PrestamosService } from './prestamos.service';
import { DIA_MS, MULTA_POR_DIA } from './prestamos.constantes';

describe('PrestamosService', () => {
  let service: PrestamosService;
  let repo: jest.Mocked<
    Pick<
      PrestamosRepository,
      'create' | 'findAll' | 'findById' | 'findActivosPorSocio' | 'save'
    >
  >;
  let libros: jest.Mocked<Pick<LibrosService, 'findOne' | 'ajustarDisponibles'>>;
  let socios: jest.Mocked<Pick<SociosService, 'findOne'>>;

  const libro: Libro = {
    id: 1,
    titulo: 'Rayuela',
    autor: 'Julio Cortázar',
    isbn: '9788437604572',
    categoria: 'novela',
    anio: 1963,
    ejemplares: 2,
    disponibles: 2,
  };
  const socio: Socio = {
    id: 2,
    nombre: 'Ana Pérez',
    email: 'ana@example.com',
  };

  const crearPrestamo = (id = 1): Prestamo => ({
    id,
    libroId: libro.id,
    socioId: socio.id,
    prestadoEn: '2025-01-01T00:00:00.000Z',
    vencimiento: '2025-01-15T00:00:00.000Z',
    devueltoEn: null,
    multa: 0,
  });

  beforeEach(async () => {
    jest.useRealTimers();
    repo = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      findActivosPorSocio: jest.fn().mockReturnValue([]),
      save: jest.fn(),
    };
    libros = {
      findOne: jest.fn().mockReturnValue(libro),
      ajustarDisponibles: jest.fn(),
    };
    socios = { findOne: jest.fn().mockReturnValue(socio) };

    const modulo = await Test.createTestingModule({
      providers: [
        PrestamosService,
        { provide: PrestamosRepository, useValue: repo },
        { provide: LibrosService, useValue: libros },
        { provide: SociosService, useValue: socios },
      ],
    }).compile();
    service = modulo.get(PrestamosService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('prestar', () => {
    it('usa el plazo predeterminado de 14 días y descuenta una copia', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
      repo.create.mockImplementation((datos) => ({ id: 3, ...datos }));

      const resultado = service.prestar({ libroId: libro.id, socioId: socio.id });

      expect(repo.create).toHaveBeenCalledWith({
        libroId: libro.id,
        socioId: socio.id,
        prestadoEn: '2025-01-01T00:00:00.000Z',
        vencimiento: '2025-01-15T00:00:00.000Z',
        devueltoEn: null,
        multa: 0,
      });
      expect(libros.ajustarDisponibles).toHaveBeenCalledWith(libro.id, -1);
      expect(resultado.id).toBe(3);
    });

    it.each([1, 30])('acepta un plazo personalizado de %i días', (dias) => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
      repo.create.mockImplementation((datos) => ({ id: 3, ...datos }));

      const resultado = service.prestar({
        libroId: libro.id,
        socioId: socio.id,
        dias,
      });

      expect(new Date(resultado.vencimiento).getTime()).toBe(
        new Date('2025-01-01T00:00:00.000Z').getTime() + dias * DIA_MS,
      );
    });

    it('propaga el error si el libro no existe', () => {
      libros.findOne.mockImplementation(() => {
        throw new NotFoundException();
      });

      expect(() => service.prestar({ libroId: 99, socioId: socio.id })).toThrow(
        NotFoundException,
      );
      expect(socios.findOne).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('propaga el error si el socio no existe', () => {
      socios.findOne.mockImplementation(() => {
        throw new NotFoundException();
      });

      expect(() => service.prestar({ libroId: libro.id, socioId: 99 })).toThrow(
        NotFoundException,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rechaza prestar cuando no quedan ejemplares', () => {
      libros.findOne.mockReturnValue({ ...libro, disponibles: 0 });

      expect(() =>
        service.prestar({ libroId: libro.id, socioId: socio.id }),
      ).toThrow(ConflictException);
      expect(libros.ajustarDisponibles).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('permite llegar a tres préstamos activos', () => {
      repo.findActivosPorSocio.mockReturnValue([
        crearPrestamo(1),
        crearPrestamo(2),
      ]);
      repo.create.mockImplementation((datos) => ({ id: 3, ...datos }));

      expect(() =>
        service.prestar({ libroId: libro.id, socioId: socio.id }),
      ).not.toThrow();
      expect(repo.create).toHaveBeenCalledTimes(1);
    });

    it('rechaza un cuarto préstamo activo del mismo socio', () => {
      repo.findActivosPorSocio.mockReturnValue([
        crearPrestamo(1),
        crearPrestamo(2),
        crearPrestamo(3),
      ]);

      expect(() =>
        service.prestar({ libroId: libro.id, socioId: socio.id }),
      ).toThrow(ConflictException);
      expect(libros.ajustarDisponibles).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('devolver', () => {
    it.each([
      ['en el vencimiento exacto', 0, 0],
      ['un milisegundo después del vencimiento', 1, MULTA_POR_DIA],
      ['exactamente un día tarde', DIA_MS, MULTA_POR_DIA],
      ['un milisegundo después de un día tarde', DIA_MS + 1, 2 * MULTA_POR_DIA],
    ])('calcula la multa %s sin esperar tiempo real', (_caso, atraso, multa) => {
      const prestamo = crearPrestamo();
      const vencimiento = new Date(prestamo.vencimiento);
      jest.useFakeTimers();
      jest.setSystemTime(vencimiento.getTime() + atraso);
      repo.findById.mockReturnValue(prestamo);
      repo.save.mockImplementation((guardado) => guardado);

      const resultado = service.devolver(prestamo.id);

      expect(resultado.multa).toBe(multa);
      expect(resultado.devueltoEn).toBe(
        new Date(vencimiento.getTime() + atraso).toISOString(),
      );
    });

    it('repone una copia disponible al devolver', () => {
      const prestamo = crearPrestamo();
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-15T00:00:00.000Z'));
      repo.findById.mockReturnValue(prestamo);
      repo.save.mockImplementation((guardado) => guardado);

      service.devolver(prestamo.id);

      expect(libros.ajustarDisponibles).toHaveBeenCalledWith(
        prestamo.libroId,
        1,
      );
      expect(repo.save).toHaveBeenCalledWith(prestamo);
    });

    it('rechaza devolver un préstamo ya devuelto', () => {
      const prestamo = { ...crearPrestamo(), devueltoEn: '2025-01-14T00:00:00.000Z' };
      repo.findById.mockReturnValue(prestamo);

      expect(() => service.devolver(prestamo.id)).toThrow(ConflictException);
      expect(libros.ajustarDisponibles).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('responde 404 al devolver un préstamo inexistente', () => {
      repo.findById.mockReturnValue(undefined);

      expect(() => service.devolver(99)).toThrow(NotFoundException);
    });
  });

  describe('consultas', () => {
    it('responde 404 al buscar un préstamo inexistente', () => {
      repo.findById.mockReturnValue(undefined);

      expect(() => service.obtener(99)).toThrow(NotFoundException);
    });

    it('lista todos los préstamos', () => {
      const prestamos = [crearPrestamo()];
      repo.findAll.mockReturnValue(prestamos);

      expect(service.listar()).toBe(prestamos);
    });

    it('lista solo préstamos vencidos que aún no fueron devueltos', () => {
      const vencido = {
        ...crearPrestamo(1),
        vencimiento: '2025-01-14T23:59:59.999Z',
      };
      const devuelto = {
        ...crearPrestamo(2),
        devueltoEn: '2025-01-14T00:00:00.000Z',
      };
      const alVencimiento = {
        ...crearPrestamo(3),
        vencimiento: '2025-01-15T00:00:00.000Z',
      };
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-15T00:00:00.000Z'));
      repo.findAll.mockReturnValue([vencido, devuelto, alVencimiento]);

      expect(service.listarVencidos()).toEqual([vencido]);
    });
  });
});
