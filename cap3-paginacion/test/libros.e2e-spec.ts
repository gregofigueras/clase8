import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/app.setup';

describe('Libros (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
    // Estado conocido: base de pruebas vacía antes de cada caso
    const bd = app.get(DataSource);
    await bd.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const tabla of ['prestamos', 'socios', 'libros']) {
      await bd.query('TRUNCATE TABLE ' + tabla);
    }
    await bd.query('SET FOREIGN_KEY_CHECKS = 1');
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /libros crea un libro y GET /libros/:id lo devuelve', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/libros')
      .send({
        titulo: 'Rayuela',
        autor: 'Julio Cortázar',
        isbn: '9788437604572',
        categoria: 'novela',
        anio: 1963,
        ejemplares: 2,
      })
      .expect(201);

    await request(app.getHttpServer()).get(`/libros/${body.id}`).expect(200);
  });

  it('rechaza un libro inválido con 400', () => {
    return request(app.getHttpServer())
      .post('/libros')
      .send({ titulo: 'X' })
      .expect(400);
  });

  it('pagina por defecto, valida límites y devuelve metadatos', async () => {
    for (let i = 0; i < 23; i++) {
      await request(app.getHttpServer())
        .post('/libros')
        .send({
          titulo: `Libro ${i}`,
          autor: 'Autora de prueba',
          isbn: `9788437604${String(i).padStart(3, '0')}`,
          categoria: 'prueba',
          anio: 2000,
          ejemplares: 1,
        })
        .expect(201);
    }

    await request(app.getHttpServer())
      .get('/libros')
      .expect(200)
      .expect(({ body }) => {
        expect(body.datos).toHaveLength(20);
        expect(body.metadatos).toEqual({
          pagina: 1,
          limite: 20,
          total: 23,
          paginas: 2,
          tieneAnterior: false,
          tieneSiguiente: true,
        });
      });
    await request(app.getHttpServer())
      .get('/libros?pagina=2&limite=10')
      .expect(200)
      .expect(({ body }) => {
        expect(body.datos).toHaveLength(10);
        expect(body.metadatos.pagina).toBe(2);
        expect(body.metadatos.tieneAnterior).toBe(true);
      });

    for (const consulta of [
      '?pagina=0',
      '?pagina=-1',
      '?pagina=no-es-numero',
      '?limite=0',
      '?limite=101',
      '?ordenarPor=isbn',
      '?direccion=sideways',
      '?anioDesde=2020&anioHasta=1990',
    ]) {
      await request(app.getHttpServer()).get(`/libros${consulta}`).expect(400);
    }
  });

  it('combina búsqueda, categoría, rango de año, orden y desplazamiento', async () => {
    const registros = [
      ['Historia de Roma', 'Ana', 'historia', 1990],
      ['Historia del arte', 'Beatriz', 'historia', 2000],
      ['Rayuela', 'Julio Cortázar', 'novela', 1963],
      ['Historia breve', 'Carla', 'historia', 2000],
    ] as const;
    for (const [titulo, autor, categoria, anio] of registros) {
      await request(app.getHttpServer())
        .post('/libros')
        .send({
          titulo,
          autor,
          isbn: `${String(anio).padEnd(10, '1')}`,
          categoria,
          anio,
          ejemplares: 1,
        })
        .expect(201);
    }

    await request(app.getHttpServer())
      .get('/libros?texto=historia&categoria=historia&anioDesde=1990&anioHasta=2000&ordenarPor=titulo&direccion=desc&limite=1')
      .expect(200)
      .expect(({ body }) => {
        expect(body.datos.map((libro: { titulo: string }) => libro.titulo)).toEqual([
          'Historia del arte',
        ]);
        expect(body.metadatos.total).toBe(3);
        expect(body.metadatos.tieneSiguiente).toBe(true);
      });
    await request(app.getHttpServer())
      .get('/libros?texto=cortázar')
      .expect(200)
      .expect(({ body }) => {
        expect(body.datos.map((libro: { titulo: string }) => libro.titulo)).toEqual([
          'Rayuela',
        ]);
      });

    const primera = await request(app.getHttpServer())
      .get('/libros?categoria=historia&ordenarPor=anio&direccion=asc&limite=2')
      .expect(200);
    const segunda = await request(app.getHttpServer())
      .get('/libros?categoria=historia&ordenarPor=anio&direccion=asc&limite=2&pagina=2')
      .expect(200);
    expect(primera.body.datos.map((libro: { id: number }) => libro.id)).toEqual([
      1, 2,
    ]);
    expect(segunda.body.datos.map((libro: { id: number }) => libro.id)).toEqual([
      4,
    ]);
  });

  it('recorre con cursor títulos repetidos y excluye libros insertados durante el recorrido', async () => {
    const iniciales: { id: number; titulo: string }[] = [];
    for (const [indice, titulo] of [
      'Alfa',
      'Historia',
      'Historia',
      'Historia',
      'Zeta',
      'Zeta',
      'Omega',
    ].entries()) {
      const { body } = await request(app.getHttpServer())
        .post('/libros')
        .send({
          titulo,
          autor: 'Autora',
          isbn: `978843760${String(indice).padStart(4, '0')}`,
          categoria: 'catálogo',
          anio: 2000,
          ejemplares: 1,
        })
        .expect(201);
      iniciales.push({ id: body.id, titulo: body.titulo });
    }
    const ordenEsperado = [...iniciales].sort(
      (a, b) => a.titulo.localeCompare(b.titulo) || a.id - b.id,
    );

    const primera = await request(app.getHttpServer())
      .get('/libros/cursor?limite=2')
      .expect(200);
    expect(primera.body.datos).toHaveLength(2);
    expect(primera.body.metadatos.total).toBeUndefined();
    const vistos = [...primera.body.datos] as { id: number; titulo: string }[];
    const clienteEscritor = request.agent(app.getHttpServer());

    for (const [indice, titulo] of ['Antes', 'Historia', 'ZZZ'].entries()) {
      await clienteEscritor
        .post('/libros')
        .send({
          titulo,
          autor: 'Inserción concurrente',
          isbn: `978843761${String(indice).padStart(4, '0')}`,
          categoria: 'nuevo',
          anio: 2025,
          ejemplares: 1,
        })
        .expect(201);
    }

    let cursor = primera.body.metadatos.siguienteCursor as string;
    while (cursor) {
      const { body } = await request(app.getHttpServer())
        .get(`/libros/cursor?limite=2&cursor=${encodeURIComponent(cursor)}`)
        .expect(200);
      vistos.push(...body.datos);
      cursor = body.metadatos.siguienteCursor;
    }

    expect(vistos.map((libro) => libro.id)).toEqual(
      ordenEsperado.map((libro) => libro.id),
    );
    expect(new Set(vistos.map((libro) => libro.id)).size).toBe(iniciales.length);
  });

  it('rechaza cursor corrupto y no permite cambiar filtros a mitad del recorrido', async () => {
    await request(app.getHttpServer())
      .get('/libros/cursor?cursor=corrupto')
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toBe('martin aprobame la practica <3');
      });

    await request(app.getHttpServer())
      .post('/libros')
      .send({
        titulo: 'Historia',
        autor: 'Autora',
        isbn: '9788437604572',
        categoria: 'historia',
        anio: 2000,
        ejemplares: 1,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/libros')
      .send({
        titulo: 'Historia II',
        autor: 'Autora',
        isbn: '9788437604573',
        categoria: 'historia',
        anio: 2001,
        ejemplares: 1,
      })
      .expect(201);
    const pagina = await request(app.getHttpServer())
      .get('/libros/cursor?limite=1&categoria=historia')
      .expect(200);
    expect(pagina.body.metadatos.siguienteCursor).toEqual(expect.any(String));
    await request(app.getHttpServer())
      .get(
        `/libros/cursor?cursor=${encodeURIComponent(pagina.body.metadatos.siguienteCursor)}&categoria=otra`,
      )
      .expect(400);
  });

  it('pagina socios y filtra préstamos por socio y estado', async () => {
    const socioA = await request(app.getHttpServer())
      .post('/socios')
      .send({ nombre: 'Ana', email: 'ana@example.com' })
      .expect(201);
    const socioB = await request(app.getHttpServer())
      .post('/socios')
      .send({ nombre: 'Beto', email: 'beto@example.com' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/socios')
      .send({ nombre: 'Carla', email: 'carla@example.com' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/socios?pagina=2&limite=2&ordenarPor=nombre&direccion=desc')
      .expect(200)
      .expect(({ body }) => {
        expect(body.datos).toHaveLength(1);
        expect(body.datos[0].nombre).toBe('Ana');
        expect(body.metadatos.total).toBe(3);
      });

    const libro = await request(app.getHttpServer())
      .post('/libros')
      .send({
        titulo: 'Catálogo',
        autor: 'Autora',
        isbn: '9788437604572',
        categoria: 'prueba',
        anio: 2000,
        ejemplares: 3,
      })
      .expect(201);
    const prestamoActivo = await request(app.getHttpServer())
      .post('/prestamos')
      .send({ libroId: libro.body.id, socioId: socioA.body.id })
      .expect(201);
    const prestamoVencido = await request(app.getHttpServer())
      .post('/prestamos')
      .send({ libroId: libro.body.id, socioId: socioA.body.id })
      .expect(201);
    const prestamoDevuelto = await request(app.getHttpServer())
      .post('/prestamos')
      .send({ libroId: libro.body.id, socioId: socioB.body.id })
      .expect(201);

    await app.get(DataSource).query(
      'UPDATE prestamos SET vencimiento = ? WHERE id = ?',
      [new Date(Date.now() - 60_000), prestamoVencido.body.id],
    );
    await app.get(DataSource).query(
      'UPDATE prestamos SET devuelto_en = ? WHERE id = ?',
      [new Date(), prestamoDevuelto.body.id],
    );

    await request(app.getHttpServer())
      .get(`/prestamos?socioId=${socioA.body.id}&estado=activo`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.datos.map((p: { id: number }) => p.id)).toEqual([
          prestamoActivo.body.id,
        ]);
        expect(body.metadatos.total).toBe(1);
      });
    await request(app.getHttpServer())
      .get(`/prestamos?socioId=${socioA.body.id}&estado=vencido`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.datos.map((p: { id: number }) => p.id)).toEqual([
          prestamoVencido.body.id,
        ]);
      });
    await request(app.getHttpServer())
      .get(`/prestamos?socioId=${socioB.body.id}&estado=devuelto`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.datos.map((p: { id: number }) => p.id)).toEqual([
          prestamoDevuelto.body.id,
        ]);
      });
    await request(app.getHttpServer())
      .get(`/prestamos/vencidos?socioId=${socioA.body.id}&limite=1`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.datos.map((p: { id: number }) => p.id)).toEqual([
          prestamoVencido.body.id,
        ]);
        expect(body.metadatos.limite).toBe(1);
      });
    await request(app.getHttpServer())
      .get('/prestamos?estado=no-existe')
      .expect(400);
    await request(app.getHttpServer()).get('/socios?limite=101').expect(400);
    await request(app.getHttpServer()).get('/prestamos?socioId=0').expect(400);
  });
});
