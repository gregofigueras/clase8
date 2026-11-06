import { Module } from '@nestjs/common';
import { AuthenticationModule } from '@nestjs/authentication';
import type { Duration } from '@nestjs/authentication';
import { AutenticacionModule } from './autenticacion/autenticacion.module';
import { LibrosModule } from './libros/libros.module';
import { PrestamosModule } from './prestamos/prestamos.module';
import { SaludController } from './salud/salud.controller';
import { SociosModule } from './socios/socios.module';

const jwtSecret =
  process.env.JWT_SECRET ??
  (process.env.NODE_ENV === 'test'
    ? 'test-only-secret-key-at-least-32-bytes-long'
    : undefined);

if (!jwtSecret) {
  throw new Error('Debe configurar JWT_SECRET con al menos 32 caracteres');
}
if (Buffer.byteLength(jwtSecret, 'utf8') < 32) {
  throw new Error('JWT_SECRET debe contener al menos 32 bytes');
}

function leerDuracion(variable: string, valorPredeterminado: string): Duration {
  const valor = process.env[variable] ?? valorPredeterminado;
  const coincidencia = /^(\d+)(ms|s|m|h|d|w)$/.exec(valor);
  if (!coincidencia) {
    throw new Error(`${variable} debe ser una duración como 5m o 30d`);
  }
  const cantidad = Number(coincidencia[1]);
  const milisegundosPorUnidad: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return cantidad * milisegundosPorUnidad[coincidencia[2]];
}

@Module({
  imports: [
    AuthenticationModule.forRoot({
      accessToken: {
        key: jwtSecret,
        issuer: process.env.JWT_ISSUER ?? 'biblioteca-cap2',
        ttl: leerDuracion('JWT_ACCESS_TTL', '5m'),
      },
      refreshToken: {
        ttl: leerDuracion('JWT_REFRESH_TTL', '7d'),
        absoluteTtl: leerDuracion('JWT_REFRESH_ABSOLUTE_TTL', '30d'),
      },
      allowInMemoryStorage: true,
    }),
    AutenticacionModule,
    LibrosModule,
    SociosModule,
    PrestamosModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}
