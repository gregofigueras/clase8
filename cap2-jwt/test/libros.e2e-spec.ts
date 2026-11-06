import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PasswordHasher } from '@nestjs/authentication';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/app.setup';

describe('Libros (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;

  beforeEach(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 10 }))
      .compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: process.env.BIBLIOTECARIO_EMAIL,
        password: process.env.BIBLIOTECARIO_PASSWORD,
      })
      .expect(200);
    accessToken = login.body.accessToken as string;
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /libros crea un libro y GET /libros/:id lo devuelve', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/libros')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        titulo: 'Rayuela',
        autor: 'Julio Cortázar',
        isbn: '9788437604572',
        categoria: 'novela',
        anio: 1963,
        ejemplares: 2,
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/libros/${body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('rechaza un libro inválido con 400', () => {
    return request(app.getHttpServer())
      .post('/libros')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ titulo: 'X' })
      .expect(400);
  });
});
