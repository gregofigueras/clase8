import {
  ConflictException,
  Injectable,
  OnModuleInit,
  NotFoundException,
} from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';
import { CrearSocioDto } from './dto/crear-socio.dto';
import { Socio } from './entities/socio.entity';
import { SociosRepository } from './socios.repository';

export type SocioPublico = Omit<Socio, 'passwordHash'>;

@Injectable()
export class SociosService implements OnModuleInit {
  constructor(
    private readonly repo: SociosRepository,
    private readonly passwords: PasswordHasher,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = process.env.BIBLIOTECARIO_EMAIL?.toLowerCase();
    const password = process.env.BIBLIOTECARIO_PASSWORD;
    if (!email && !password) return;
    if (!email || !password) {
      throw new Error(
        'BIBLIOTECARIO_EMAIL y BIBLIOTECARIO_PASSWORD deben configurarse juntos',
      );
    }
    if (this.repo.findByEmail(email)) return;

    this.repo.create({
      nombre: 'Bibliotecario',
      email,
      passwordHash: await this.passwords.hash(password),
      rol: 'bibliotecario',
    });
  }

  async create(dto: CrearSocioDto): Promise<SocioPublico> {
    const email = dto.email.toLowerCase();
    if (this.repo.findByEmail(email)) {
      throw new ConflictException('Ya existe un socio con ese email');
    }
    const socio = this.repo.create({
      nombre: dto.nombre,
      email,
      passwordHash: await this.passwords.hash(dto.password),
      rol: 'socio',
    });
    return this.publico(socio);
  }

  findAll(): SocioPublico[] {
    return this.repo.findAll().map((socio) => this.publico(socio));
  }

  findOne(id: number): SocioPublico {
    const socio = this.repo.findById(id);
    if (!socio) throw new NotFoundException(`El socio ${id} no existe`);
    return this.publico(socio);
  }

  async verificarCredenciales(
    email: string,
    password: string,
  ): Promise<SocioPublico | null> {
    const socio = this.repo.findByEmail(email.toLowerCase());
    const valida = await this.passwords.verify(
      password,
      socio?.passwordHash,
    );
    return valida && socio ? this.publico(socio) : null;
  }

  buscarParaAutenticacion(id: number): SocioPublico | undefined {
    const socio = this.repo.findById(id);
    return socio ? this.publico(socio) : undefined;
  }

  private publico(socio: Socio): SocioPublico {
    const { passwordHash: _passwordHash, ...datos } = socio;
    return datos;
  }
}
