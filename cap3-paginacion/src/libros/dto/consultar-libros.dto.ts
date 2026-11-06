import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginacionDto } from '../../common/pagination/paginacion.dto';

export class ConsultarLibrosDto extends PaginacionDto {
  @IsOptional()
  @IsIn(['id', 'titulo', 'autor', 'categoria', 'anio'])
  override ordenarPor = 'id';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  categoria?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1450)
  @Max(2100)
  anioDesde?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1450)
  @Max(2100)
  anioHasta?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  texto?: string;
}

export class ConsultarCatalogoCursorDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite = 20;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  categoria?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1450)
  @Max(2100)
  anioDesde?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1450)
  @Max(2100)
  anioHasta?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  texto?: string;
}
