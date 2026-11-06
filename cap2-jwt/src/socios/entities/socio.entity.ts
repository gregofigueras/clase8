export class Socio {
  id: number;
  nombre: string;
  email: string;
  passwordHash: string;
  rol: 'socio' | 'bibliotecario';
}
