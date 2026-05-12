import { Injectable, PipeTransform } from '@nestjs/common';
import { CepInvalidException } from '../errors/cep.errors';

const CEP_REGEX = /^\d{8}$/;

/**
 * Barreira de entrada da aplicação. Aceita CEP de 8 dígitos com ou sem hífen
 * e devolve o valor normalizado (apenas dígitos). Em qualquer outro formato,
 * lança CepInvalidException — traduzida pelo filter para HTTP 400.
 */
@Injectable()
export class CepValidationPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    const sanitized = (value ?? '').replace(/-/g, '').trim();

    if (!CEP_REGEX.test(sanitized)) {
      throw new CepInvalidException(value);
    }

    return sanitized;
  }
}
