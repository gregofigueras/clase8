import { IsIn } from 'class-validator';
import { PaginacionDto } from '../../common/pagination/paginacion.dto';

export class ConsultarSociosDto extends PaginacionDto {
  @IsIn(['id', 'nombre', 'email'])
  override ordenarPor = 'id';
}
