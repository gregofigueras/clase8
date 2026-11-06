import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginacionDto } from '../../common/pagination/paginacion.dto';

export class ConsultarPrestamosDto extends PaginacionDto {
  @IsOptional()
  @IsIn([
    'id',
    'libroId',
    'socioId',
    'prestadoEn',
    'vencimiento',
    'devueltoEn',
    'multa',
  ])
  override ordenarPor = 'id';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  socioId?: number;

  @IsOptional()
  @IsIn(['activo', 'devuelto', 'vencido'])
  estado?: 'activo' | 'devuelto' | 'vencido';
}
