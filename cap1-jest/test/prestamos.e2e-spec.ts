import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/app.setup';

describe('Préstamos (e2e)', () => {
  let app: INestApplication<App>;

  const datosLibro = (ejemplares = 2) => ({
    titulo: 'Rayuela',
    autor: 'Julio Cortázar',
    isbn: '9788437604572',
    categoria: 'novela',
    anio: 1963,
    ejemplares,
  });
  const datosSocio = {
    nombre: 'Ana Pérez',
    email: 'ana@example.com',
  };

  beforeEach(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function registrarLibro(ejemplares = 2) {
    const respuesta = await request(app.getHttpServer())
      .post('/libros')
      .send(datosLibro(ejemplares))
      .expect(201);
    return respuesta.body as { id: number; disponibles: number };
  }

  async function registrarSocio() {
    const respuesta = await request(app.getHttpServer())
      .post('/socios')
      .send(datosSocio)
      .expect(201);
    return respuesta.body as { id: number };
  }

  it('registra libro y socio, presta, consulta y devuelve el ejemplar', async () => {
    const libro = await registrarLibro();
    const socio = await registrarSocio();

    expect(libro.disponibles).toBe(2);
    const prestamo = await request(app.getHttpServer())
      .post('/prestamos')
      .send({ libroId: libro.id, socioId: socio.id })
      .expect(201);

    expect(prestamo.body.devueltoEn).toBeNull();
    expect(prestamo.body.multa).toBe(0);
    expect(
      new Date(prestamo.body.vencimiento).getTime() -
        new Date(prestamo.body.prestadoEn).getTime(),
    ).toBe(14 * 24 * 60 * 60 * 1000);
    await request(app.getHttpServer())
      .get(`/libros/${libro.id}`)
      .expect(200)
      .expect(({ body }) => expect(body.disponibles).toBe(1));
    await request(app.getHttpServer())
      .get(`/prestamos/${prestamo.body.id}`)
      .expect(200)
      .expect(({ body }) => expect(body.id).toBe(prestamo.body.id));

    await request(app.getHttpServer())
      .post(`/prestamos/${prestamo.body.id}/devolucion`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.devueltoEn).toEqual(expect.any(String));
        expect(body.multa).toBe(0);
      });
    await request(app.getHttpServer())
      .get(`/libros/${libro.id}`)
      .expect(200)
      .expect(({ body }) => expect(body.disponibles).toBe(2));
  });

  it('rechaza libros inválidos y plazos fuera del rango permitido', async () => {
    await request(app.getHttpServer())
      .post('/libros')
      .send({ titulo: 'X' })
      .expect(400);
    const libro = await registrarLibro();
    const socio = await registrarSocio();

    for (const dias of [0, 31]) {
      await request(app.getHttpServer())
        .post('/prestamos')
        .send({ libroId: libro.id, socioId: socio.id, dias })
        .expect(400);
    }
  });

  it('responde 404 cuando no existe el libro, el socio o el préstamo', async () => {
    const libro = await registrarLibro();
    const socio = await registrarSocio();

    await request(app.getHttpServer())
      .post('/prestamos')
      .send({ libroId: 999, socioId: socio.id })
      .expect(404);
    await request(app.getHttpServer())
      .post('/prestamos')
      .send({ libroId: libro.id, socioId: 999 })
      .expect(404);
    await request(app.getHttpServer()).get('/prestamos/999').expect(404);
    await request(app.getHttpServer())
      .post('/prestamos/999/devolucion')
      .expect(404);
  });

  it('rechaza prestar sin disponibilidad y conserva el inventario', async () => {
    const libro = await registrarLibro(1);
    const socio = await registrarSocio();
    const dto = { libroId: libro.id, socioId: socio.id };

    await request(app.getHttpServer()).post('/prestamos').send(dto).expect(201);
    await request(app.getHttpServer()).post('/prestamos').send(dto).expect(409);
    await request(app.getHttpServer())
      .get(`/libros/${libro.id}`)
      .expect(200)
      .expect(({ body }) => expect(body.disponibles).toBe(0));
  });

  it('permite tres préstamos activos y rechaza el cuarto del mismo socio', async () => {
    const libro = await registrarLibro(4);
    const socio = await registrarSocio();
    const dto = { libroId: libro.id, socioId: socio.id };

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).post('/prestamos').send(dto).expect(201);
    }
    await request(app.getHttpServer()).post('/prestamos').send(dto).expect(409);
    await request(app.getHttpServer())
      .get(`/libros/${libro.id}`)
      .expect(200)
      .expect(({ body }) => expect(body.disponibles).toBe(1));
  });

  it('rechaza devolver dos veces el mismo préstamo', async () => {
    const libro = await registrarLibro(1);
    const socio = await registrarSocio();
    const respuesta = await request(app.getHttpServer())
      .post('/prestamos')
      .send({ libroId: libro.id, socioId: socio.id })
      .expect(201);
    const ruta = `/prestamos/${respuesta.body.id}/devolucion`;

    await request(app.getHttpServer()).post(ruta).expect(200);
    await request(app.getHttpServer()).post(ruta).expect(409);
  });
});
