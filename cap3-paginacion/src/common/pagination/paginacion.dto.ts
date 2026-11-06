import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class PaginacionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  pagina = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite = 20;

  @IsOptional()
  @IsString()
  ordenarPor = 'id';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  direccion: 'asc' | 'desc' = 'asc';
}

export interface MetadatosPagina {
  pagina: number;
  limite: number;
  total: number;
  paginas: number;
  tieneAnterior: boolean;
  tieneSiguiente: boolean;
}

export interface ResultadoPaginado<T> {
  datos: T[];
  metadatos: MetadatosPagina;
}
