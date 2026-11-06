import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { PaginacionDto, ResultadoPaginado } from './paginacion.dto';

export async function paginar<T extends ObjectLiteral>(
  consulta: SelectQueryBuilder<T>,
  opciones: PaginacionDto,
  ordenesPermitidos: Record<string, string>,
): Promise<ResultadoPaginado<T>> {
  const columna = Object.hasOwn(ordenesPermitidos, opciones.ordenarPor)
    ? ordenesPermitidos[opciones.ordenarPor]
    : undefined;
  if (!columna) {
    throw new Error(`Orden no configurado: ${opciones.ordenarPor}`);
  }

  const saltar = (opciones.pagina - 1) * opciones.limite;
  consulta.orderBy(columna, opciones.direccion.toUpperCase() as 'ASC' | 'DESC');
  if (columna !== ordenesPermitidos.id) {
    consulta.addOrderBy(
      ordenesPermitidos.id,
      opciones.direccion.toUpperCase() as 'ASC' | 'DESC',
    );
  }
  const [datos, total] = await consulta
    .skip(saltar)
    .take(opciones.limite)
    .getManyAndCount();
  const paginas = Math.ceil(total / opciones.limite);

  return {
    datos,
    metadatos: {
      pagina: opciones.pagina,
      limite: opciones.limite,
      total,
      paginas,
      tieneAnterior: opciones.pagina > 1 && total > 0,
      tieneSiguiente: saltar + datos.length < total,
    },
  };
}
