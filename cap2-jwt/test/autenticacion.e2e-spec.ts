import {
  Controller,
  Get,
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CurrentUser, PasswordHasher } from '@nestjs/authentication';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { SociosRepository } from '../src/socios/socios.repository';
import type { UsuarioAutenticado } from '../src/autenticacion/usuario-autenticado';
import { configurarApp } from '../src/app.setup';

@Controller('ruta-nueva-de-prueba')
class RutaNuevaDePrueba {
  @Get()
  comprobar(@CurrentUser() usuario: UsuarioAutenticado) {
    return { usuario: usuario.id };
  }
}

describe('Autenticación y autorización (e2e)', () => {
  let app: INestApplication<App>;

  const socioDatos = (email: string, nombre = 'Socio') => ({
    nombre,
    email,
    password: 'clave-segura-123',
  });

  beforeEach(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [RutaNuevaDePrueba],
    })
      .overrideProvider(PasswordHasher)
      .useValue(new PasswordHasher({ logN: 10 }))
      .compile();
    app = modulo.createNestApplication();
    configurarApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function registrar(email: string, nombre?: string) {
    const { body } = await request(app.getHttpServer())
      .post('/socios')
      .send(socioDatos(email, nombre))
      .expect(201);
    expect(body.password).toBeUndefined();
    expect(body.passwordHash).toBeUndefined();
    return body as { id: number; email: string; rol: string };
  }

  async function login(
    email: string,
    password = 'clave-segura-123',
  ) {
    const respuesta = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return respuesta.body as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };
  }

  const bearer = (token: string) => `Bearer ${token}`;
  const libro = {
    titulo: 'Rayuela',
    autor: 'Julio Cortázar',
    isbn: '9788437604572',
    categoria: 'novela',
    anio: 1963,
    ejemplares: 3,
  };

  it('deja públicas únicamente salud, registro y login, y protege rutas nuevas por defecto', async () => {
    await request(app.getHttpServer()).get('/salud').expect(200);
    await registrar('socia@biblioteca.test');
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'socia@biblioteca.test', password: 'clave-segura-123' })
      .expect(200);

    await request(app.getHttpServer()).get('/libros').expect(401);
    await request(app.getHttpServer()).post('/libros').send(libro).expect(401);
    await request(app.getHttpServer()).get('/socios').expect(401);
    await request(app.getHttpServer()).get('/prestamos').expect(401);
    await request(app.getHttpServer()).get('/prestamos/vencidos').expect(401);
    await request(app.getHttpServer())
      .get('/ruta-nueva-de-prueba')
      .expect(401);
    await request(app.getHttpServer()).post('/auth/logout-todos').expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'invalid' })
      .expect(401);
  });

  it('hashea contraseñas y emite JWT con identidad, rol, emisor y expiración', async () => {
    const socio = await registrar('socia@biblioteca.test');
    const tokens = await login(socio.email);
    const claims = JSON.parse(
      Buffer.from(tokens.accessToken.split('.')[1], 'base64url').toString(),
    ) as Record<string, unknown>;

    expect(tokens.expiresIn).toBe(300);
    expect(claims.sub).toBe(String(socio.id));
    expect(claims.email).toBe(socio.email);
    expect(claims.role).toBe('socio');
    expect(claims.iss).toBe('biblioteca-test');
    expect(claims.exp).toEqual(expect.any(Number));
    expect(claims.sid).toEqual(expect.any(String));
    await request(app.getHttpServer())
      .get(`/socios/${socio.id}`)
      .set('Authorization', bearer(tokens.accessToken))
      .expect(200)
      .expect(({ body }) => {
        expect(body.password).toBeUndefined();
        expect(body.passwordHash).toBeUndefined();
      });
    await request(app.getHttpServer())
      .get('/socios')
      .set('Authorization', bearer(tokens.accessToken))
      .expect(200)
      .expect(({ body }) => {
        expect(body[0].password).toBeUndefined();
        expect(body[0].passwordHash).toBeUndefined();
      });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: socio.email, password: 'otra-clave-incorrecta' })
      .expect(401);
  });

  it('no permite reclamar por registro público el rol de bibliotecario', async () => {
    await request(app.getHttpServer())
      .post('/socios')
      .send(socioDatos(process.env.BIBLIOTECARIO_EMAIL!))
      .expect(409);

    const tokens = await login(
      process.env.BIBLIOTECARIO_EMAIL!,
      process.env.BIBLIOTECARIO_PASSWORD!,
    );
    const claims = JSON.parse(
      Buffer.from(tokens.accessToken.split('.')[1], 'base64url').toString(),
    ) as Record<string, unknown>;
    expect(claims.role).toBe('bibliotecario');
  });

  it('permite escrituras de libros solo al bibliotecario', async () => {
    const socio = await registrar('socia@biblioteca.test');
    const tokenSocio = await login(socio.email);
    await request(app.getHttpServer())
      .post('/libros')
      .set('Authorization', bearer(tokenSocio.accessToken))
      .send(libro)
      .expect(403);

    const tokenBibliotecario = await login(
      process.env.BIBLIOTECARIO_EMAIL!,
      process.env.BIBLIOTECARIO_PASSWORD!,
    );
    const creado = await request(app.getHttpServer())
      .post('/libros')
      .set('Authorization', bearer(tokenBibliotecario.accessToken))
      .send(libro)
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/libros/${creado.body.id}`)
      .set('Authorization', bearer(tokenSocio.accessToken))
      .send({ categoria: 'actualizada' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/libros/${creado.body.id}`)
      .set('Authorization', bearer(tokenSocio.accessToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/prestamos/vencidos')
      .set('Authorization', bearer(tokenSocio.accessToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/prestamos/vencidos')
      .set('Authorization', bearer(tokenBibliotecario.accessToken))
      .expect(200);

    const socioGuardado = app
      .get(SociosRepository)
      .findByEmail(process.env.BIBLIOTECARIO_EMAIL!);
    if (!socioGuardado) throw new Error('El socio de prueba debe existir');
    socioGuardado.rol = 'socio';
    await request(app.getHttpServer())
      .get('/libros')
      .set('Authorization', bearer(tokenBibliotecario.accessToken))
      .expect(200);
    await request(app.getHttpServer())
      .post('/libros')
      .set('Authorization', bearer(tokenBibliotecario.accessToken))
      .send({ ...libro, isbn: '9788437604574' })
      .expect(403);
  });

  it('deriva al socio del token y oculta préstamos ajenos con 404', async () => {
    const socioA = await registrar('socio-a@biblioteca.test', 'Socio A');
    const socioB = await registrar('socio-b@biblioteca.test', 'Socio B');
    const tokenBibliotecario = await login(
      process.env.BIBLIOTECARIO_EMAIL!,
      process.env.BIBLIOTECARIO_PASSWORD!,
    );
    const libroCreado = await request(app.getHttpServer())
      .post('/libros')
      .set('Authorization', bearer(tokenBibliotecario.accessToken))
      .send(libro)
      .expect(201);
    const tokensA = await login(socioA.email);
    const tokensB = await login(socioB.email);

    const prestamo = await request(app.getHttpServer())
      .post('/prestamos')
      .set('Authorization', bearer(tokensA.accessToken))
      .send({ libroId: libroCreado.body.id, socioId: socioB.id })
      .expect(400);
    expect(prestamo.body.statusCode).toBe(400);

    const propio = await request(app.getHttpServer())
      .post('/prestamos')
      .set('Authorization', bearer(tokensA.accessToken))
      .send({ libroId: libroCreado.body.id })
      .expect(201);
    expect(propio.body.socioId).toBe(socioA.id);
    await request(app.getHttpServer())
      .get('/prestamos')
      .set('Authorization', bearer(tokensB.accessToken))
      .expect(200)
      .expect(({ body }) => expect(body).toEqual([]));
    await request(app.getHttpServer())
      .get(`/prestamos/${propio.body.id}`)
      .set('Authorization', bearer(tokensB.accessToken))
      .expect(404);
    await request(app.getHttpServer())
      .post(`/prestamos/${propio.body.id}/devolucion`)
      .set('Authorization', bearer(tokensB.accessToken))
      .expect(404);
    await request(app.getHttpServer())
      .post(`/prestamos/${propio.body.id}/devolucion`)
      .set('Authorization', bearer(tokensA.accessToken))
      .expect(200);
  });

  it('rota refresh tokens y cierra toda la sesión al detectar reutilización', async () => {
    const socio = await registrar('socia@biblioteca.test');
    const original = await login(socio.email);
    const rotado = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: original.refreshToken })
      .expect(200);
    expect(rotado.body.refreshToken).not.toBe(original.refreshToken);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: original.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .get('/libros')
      .set('Authorization', bearer(original.accessToken))
      .expect(401);
    await request(app.getHttpServer())
      .get('/libros')
      .set('Authorization', bearer(rotado.body.accessToken))
      .expect(401);
  });

  it('cierra un dispositivo o todos los dispositivos, incluyendo sus tokens de acceso', async () => {
    const socio = await registrar('socia@biblioteca.test');
    const dispositivoA = await login(socio.email);
    const dispositivoB = await login(socio.email);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', bearer(dispositivoA.accessToken))
      .send({ refreshToken: dispositivoB.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', bearer(dispositivoA.accessToken))
      .send({ refreshToken: dispositivoA.refreshToken })
      .expect(204);
    await request(app.getHttpServer())
      .get('/libros')
      .set('Authorization', bearer(dispositivoA.accessToken))
      .expect(401);
    await request(app.getHttpServer())
      .get('/libros')
      .set('Authorization', bearer(dispositivoB.accessToken))
      .expect(200);

    const dispositivoC = await login(socio.email);
    await request(app.getHttpServer())
      .post('/auth/logout-todos')
      .set('Authorization', bearer(dispositivoB.accessToken))
      .expect(204);
    await request(app.getHttpServer())
      .get('/libros')
      .set('Authorization', bearer(dispositivoB.accessToken))
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: dispositivoC.refreshToken })
      .expect(401);
  });
});
