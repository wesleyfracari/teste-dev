import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { CepCacheService } from './cache/cep-cache.service';
import {
  CIRCUIT_BREAKER,
  CircuitBreaker,
} from './circuit-breaker/circuit-breaker';
import { CepResponseDto } from './dto/cep-response.dto';
import {
  AllProvidersUnavailableException,
  CepNotFoundException,
} from './errors/cep.errors';
import {
  CEP_PROVIDERS,
  CepProvider,
} from './providers/cep-provider.interface';

@Injectable()
export class CepService {
  private roundRobinIndex = 0;

  constructor(
    @Inject(CEP_PROVIDERS)
    private readonly providers: ReadonlyArray<CepProvider>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: LoggerService,
    private readonly cache: CepCacheService,
    @Inject(CIRCUIT_BREAKER) private readonly breaker: CircuitBreaker,
  ) {
    if (!providers || providers.length === 0) {
      throw new Error('CepService requer ao menos um CepProvider registrado');
    }
  }

  async findByCep(cep: string): Promise<CepResponseDto> {
    const cached = this.cache.get(cep);
    if (cached) {
      this.logger.log({
        message: 'Cache HIT — resposta servida sem chamar provedor externo',
        cep,
        provider: cached.provider,
      });
      return cached;
    }

    const ordered = this.nextProvidersRotation();
    const providerErrors: Record<string, string> = {};

    for (const provider of ordered) {
      if (!this.breaker.canExecute(provider.name)) {
        this.logger.warn({
          message: 'Circuit breaker OPEN — provedor pulado',
          cep,
          provider: provider.name,
        });
        providerErrors[provider.name] = 'circuit breaker OPEN';
        continue;
      }

      try {
        this.logger.log({
          message: 'Consultando provedor de CEP',
          cep,
          provider: provider.name,
        });

        const result = await provider.fetch(cep);
        this.breaker.recordSuccess(provider.name);
        this.cache.set(cep, result);

        this.logger.log({
          message: 'Provedor respondeu com sucesso',
          cep,
          provider: provider.name,
        });

        return result;
      } catch (err) {
        // Erro de negócio (CEP inexistente): provedor respondeu corretamente.
        // Não conta como falha técnica e não deve cascatear para o próximo.
        if (err instanceof CepNotFoundException) {
          this.breaker.recordSuccess(provider.name);
          this.logger.warn({
            message: 'CEP não encontrado — fast fail, sem fallback',
            cep,
            provider: provider.name,
          });
          throw err;
        }

        this.breaker.recordFailure(provider.name);
        const message = err instanceof Error ? err.message : String(err);
        providerErrors[provider.name] = message;

        this.logger.warn({
          message: 'Provedor falhou — tentando próximo',
          cep,
          provider: provider.name,
          error: message,
          breakerState: this.breaker.getState(provider.name),
        });
      }
    }

    this.logger.error({
      message: 'Todos os provedores falharam',
      cep,
      providerErrors,
    });

    throw new AllProvidersUnavailableException(cep, providerErrors);
  }

  /**
   * Avança o índice de round-robin e devolve a lista reordenada
   * a partir da posição atual. Tem efeito colateral intencional
   * (incrementa `roundRobinIndex`) — o nome reflete isso.
   *
   * Limitação assumida: índice em memória local. Em multi-instância
   * cada réplica terá sua própria rotação.
   */
  private nextProvidersRotation(): ReadonlyArray<CepProvider> {
    const startIndex = this.roundRobinIndex;
    this.roundRobinIndex = (this.roundRobinIndex + 1) % this.providers.length;

    return [
      ...this.providers.slice(startIndex),
      ...this.providers.slice(0, startIndex),
    ];
  }
}
