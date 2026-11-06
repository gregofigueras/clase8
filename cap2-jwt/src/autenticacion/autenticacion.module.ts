import { Module } from '@nestjs/common';
import { SociosModule } from '../socios/socios.module';
import { AutenticacionController } from './autenticacion.controller';
import { AutenticacionService } from './autenticacion.service';
import { JwtAuthProvider } from './jwt-auth.provider';
import { RolGuard } from './rol.guard';

@Module({
  imports: [SociosModule],
  controllers: [AutenticacionController],
  providers: [AutenticacionService, JwtAuthProvider, RolGuard],
  exports: [AutenticacionService],
})
export class AutenticacionModule {}
