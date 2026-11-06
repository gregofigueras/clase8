# Biblioteca: base del capítulo 2 (JWT y rutas autenticadas)

API de una biblioteca universitaria con tres recursos: **libros**, **socios** y **préstamos**.
Los datos viven en memoria (se pierden al reiniciar). La aplicación incorpora JWT,
autorización por roles y rotación de refresh tokens para los requisitos del capítulo 2.

## Autenticación

Se requiere `JWT_SECRET` de al menos 32 caracteres. `JWT_ISSUER` define el emisor
(por defecto `biblioteca-cap2`) y `JWT_ACCESS_TTL` define la vida del token de
acceso (por defecto `5m`). Los refresh tokens duran `JWT_REFRESH_TTL` (por
defecto `7d`) y su familia como máximo `JWT_REFRESH_ABSOLUTE_TTL` (por defecto
`30d`). Configure `BIBLIOTECARIO_EMAIL` y `BIBLIOTECARIO_PASSWORD` juntos para
crear el bibliotecario inicial al arrancar. El registro público siempre crea
socios, por lo que nadie puede reclamar el rol administrativo al registrar ese
email.

El endpoint `POST /socios` registra usuarios con contraseña y nunca devuelve la
contraseña ni su hash. `POST /auth/login` recibe `email` y `password`; devuelve
`accessToken`, `refreshToken` y `expiresIn`. `POST /auth/refresh` recibe el
refresh token anterior y lo rota. Reutilizar uno ya rotado invalida toda la
sesión de ese dispositivo, incluidos sus access tokens. `POST /auth/logout`
recibe el refresh token del dispositivo autenticado; `POST /auth/logout-todos`
revoca todas las sesiones del socio. Enviar access tokens como
`Authorization: Bearer <accessToken>`.

La autenticación del paquete `@nestjs/authentication` protege globalmente las
rutas por defecto. Solo el registro, el login y `GET /salud` llevan `@Public()`.
El refresh no es público: admite la ausencia de access token únicamente porque
exige un refresh token válido, de un solo uso, para operar. Los endpoints de
libros para escritura y `GET /prestamos/vencidos` requieren rol bibliotecario.
Los socios solo ven y devuelven sus propios préstamos; los préstamos ajenos
responden igual que los inexistentes (`404`).

El rol se autoriza consultando la cuenta actual en cada solicitud, no confiando
en el `role` del JWT. El claim se incluye como dato de emisión, pero si se
degrada a un bibliotecario, su access token vigente deja de autorizar operaciones
administrativas inmediatamente. Los datos y las sesiones son en memoria y se
pierden al reiniciar; esta configuración no sustituye almacenamiento persistente
para una instalación de producción.


## Uso

```
npm install
npm run start:dev      # http://localhost:3000
npm test               # tests unitarios (src/**/*.spec.ts)
npm run test:e2e       # tests e2e (test/*.e2e-spec.ts)
```

Requiere Node.js 22.22 o superior.
Si usa Windows PowerShell, los scripts funcionan igual: están definidos en `package.json`.
