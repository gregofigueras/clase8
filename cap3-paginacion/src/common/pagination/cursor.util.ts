import { BadRequestException } from '@nestjs/common';

export interface CursorCatalogo {
  version: 1;
  idMaximo: number;
  ultimoTitulo: string;
  ultimoId: number;
  categoria?: string;
  anioDesde?: number;
  anioHasta?: number;
  texto?: string;
}

export function codificarCursor(cursor: CursorCatalogo): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodificarCursor(valor: string): CursorCatalogo {
  try {
    const cursor: unknown = JSON.parse(
      Buffer.from(valor, 'base64url').toString('utf8'),
    );
    if (
      typeof cursor !== 'object' ||
      cursor === null ||
      !('version' in cursor) ||
      cursor.version !== 1 ||
      !('idMaximo' in cursor) ||
      typeof cursor.idMaximo !== 'number' ||
      !Number.isSafeInteger(cursor.idMaximo) ||
      !('ultimoTitulo' in cursor) ||
      typeof cursor.ultimoTitulo !== 'string' ||
      cursor.ultimoTitulo.length > 200 ||
      !('ultimoId' in cursor) ||
      typeof cursor.ultimoId !== 'number' ||
      !Number.isSafeInteger(cursor.ultimoId) ||
      cursor.idMaximo < 0 ||
      cursor.ultimoId < 1 ||
      cursor.ultimoId > cursor.idMaximo ||
      ('categoria' in cursor &&
        cursor.categoria !== undefined &&
        (typeof cursor.categoria !== 'string' ||
          cursor.categoria.length > 60)) ||
      ('anioDesde' in cursor &&
        cursor.anioDesde !== undefined &&
        (typeof cursor.anioDesde !== 'number' ||
          !Number.isInteger(cursor.anioDesde) ||
          cursor.anioDesde < 1450 ||
          cursor.anioDesde > 2100)) ||
      ('anioHasta' in cursor &&
        cursor.anioHasta !== undefined &&
        (typeof cursor.anioHasta !== 'number' ||
          !Number.isInteger(cursor.anioHasta) ||
          cursor.anioHasta < 1450 ||
          cursor.anioHasta > 2100)) ||
      ('texto' in cursor &&
        cursor.texto !== undefined &&
        (typeof cursor.texto !== 'string' || cursor.texto.length > 100))
    ) {
      throw new Error('Cursor inválido');
    }
    return cursor as CursorCatalogo;
  } catch {
    throw new BadRequestException('martin aprobame la practica <3');
  }
}
