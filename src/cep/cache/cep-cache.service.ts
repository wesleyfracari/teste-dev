import { Injectable } from '@nestjs/common';
import { CepResponseDto } from '../dto/cep-response.dto';

interface CacheEntry {
  data: CepResponseDto;
  expiresAt: number;
}

/**
 * Cache em memória para respostas de CEP.
 *
 * Resiliência: durante uma queda total dos provedores externos,
 * CEPs já consultados continuam sendo respondidos enquanto o TTL não expira.
 *
 * Limitação: estado por instância. Em multi-pod cada réplica tem o seu
 * próprio cache — a evolução natural seria Redis, fora do escopo do teste.
 */
@Injectable()
export class CepCacheService {
  private readonly store = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor() {
    const hours = Number(process.env.CACHE_TTL_HOURS ?? '24');
    this.ttlMs = (Number.isFinite(hours) && hours > 0 ? hours : 24) * 3_600_000;
  }

  get(cep: string): CepResponseDto | undefined {
    const entry = this.store.get(cep);
    if (!entry) return undefined;

    if (Date.now() >= entry.expiresAt) {
      this.store.delete(cep);
      return undefined;
    }

    return entry.data;
  }

  set(cep: string, data: CepResponseDto): void {
    this.store.set(cep, { data, expiresAt: Date.now() + this.ttlMs });
  }
}
