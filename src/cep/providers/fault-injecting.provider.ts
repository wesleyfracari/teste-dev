import { CepResponseDto } from '../dto/cep-response.dto';
import { CepProvider } from './cep-provider.interface';

/**
 * Decorator que envolve um CepProvider real e força falha técnica
 * quando configurado. Usado pela env `FAIL_PROVIDERS` para demonstrar
 * fallback / circuit breaker em ambiente local sem derrubar internet.
 *
 * Mantém os providers concretos limpos: nenhuma lógica de demo neles
 * nem no CepService.
 */
export class FaultInjectingProvider implements CepProvider {
  readonly name: string;

  constructor(
    private readonly delegate: CepProvider,
    private readonly shouldFail: () => boolean,
  ) {
    this.name = delegate.name;
  }

  async fetch(cep: string): Promise<CepResponseDto> {
    if (this.shouldFail()) {
      throw new Error(
        `[FAULT INJECTION] ${this.name} configurado para falhar`,
      );
    }
    return this.delegate.fetch(cep);
  }
}
