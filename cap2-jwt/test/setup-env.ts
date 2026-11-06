// Variables de entorno para los tests e2e
process.env.JWT_SECRET = 'test-only-secret-key-at-least-32-bytes-long';
process.env.JWT_ISSUER = 'biblioteca-test';
process.env.JWT_ACCESS_TTL = '5m';
process.env.BIBLIOTECARIO_EMAIL = 'bibliotecario@biblioteca.test';
process.env.BIBLIOTECARIO_PASSWORD = 'clave-bibliotecario-123';
