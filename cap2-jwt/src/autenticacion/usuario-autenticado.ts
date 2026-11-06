import type { Rol } from './roles.decorator';

export interface UsuarioAutenticado {
  id: number;
  email: string;
  rol: Rol;
  sessionId: string;
}
