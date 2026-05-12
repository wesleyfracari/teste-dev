import { HttpModule } from '@nestjs/axios';
import { Inject, Logger, Module, OnModuleInit } from '@nestjs/common';
import { CepCacheService } from './cache/cep-cache.service';
import { CepController } from './cep.controller';
import { CepService } from './cep.service';
import {
  CIRCUIT_BREAKER,
  CircuitBreaker,
} from './circuit-breaker/circuit-breaker';
import { BrasilApiProvider } from './providers/brasilapi.provider';
import {
  CEP_PROVIDERS,
  CepProvider,
} from './providers/cep-provider.interface';
import { FaultInjectingProvider } from './providers/fault-injecting.provider';
import { ViaCepProvider } from './providers/viacep.provider';

/**
 * Único lugar do código que conhece as implementações concretas dos provedores.
 *
 * Para adicionar uma terceira API:
 *   1. Implemente CepProvider em src/cep/providers/<novo>.provider.ts
 *   2. Adicione a classe ao array do useFactory de CEP_PROVIDERS abaixo
 * CepService, Controller e Filter não precisam mudar.
 */
@Module({
  imports: [HttpModule],
  controllers: [CepController],
  providers: [
    ViaCepProvider,
    BrasilApiProvider,
    {
      provide: CEP_PROVIDERS,
      useFactory: (
        viacep: ViaCepProvider,
        brasilapi: BrasilApiProvider,
      ): ReadonlyArray<CepProvider> => {
        const forced = new Set(
          (process.env.FAIL_PROVIDERS ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        );

        const wrap = (p: CepProvider): CepProvider =>
          forced.has(p.name)
            ? new FaultInjectingProvider(p, () => true)
            : p;

        return [wrap(viacep), wrap(brasilapi)];
      },
      inject: [ViaCepProvider, BrasilApiProvider],
    },
    CepCacheService,
    {
      provide: CIRCUIT_BREAKER,
      useFactory: (): CircuitBreaker =>
        new CircuitBreaker({
          failureThreshold: Number(process.env.BREAKER_THRESHOLD ?? '3'),
          cooldownMs: Number(process.env.BREAKER_COOLDOWN_MS ?? '30000'),
        }),
    },
    CepService,
  ],
})
export class CepModule implements OnModuleInit {
  constructor(
    @Inject(CEP_PROVIDERS)
    private readonly providers: ReadonlyArray<CepProvider>,
  ) {}

  onModuleInit(): void {
    const fauxNames = this.providers
      .filter((p) => p instanceof FaultInjectingProvider)
      .map((p) => p.name);

    if (fauxNames.length > 0) {
      new Logger('CepModule').warn(
        `[DEMO MODE] Fault injection ativa em: ${fauxNames.join(', ')}`,
      );
    }
  }
}
