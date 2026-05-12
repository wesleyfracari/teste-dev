import { LoggerService } from '@nestjs/common';
import { CepCacheService } from './cache/cep-cache.service';
import { CepService } from './cep.service';
import { CircuitBreaker } from './circuit-breaker/circuit-breaker';
import { CepResponseDto } from './dto/cep-response.dto';
import {
  AllProvidersUnavailableException,
  CepNotFoundException,
} from './errors/cep.errors';
import { CepProvider } from './providers/cep-provider.interface';

class MockProvider implements CepProvider {
  fetch = jest.fn<Promise<CepResponseDto>, [string]>();
  constructor(public readonly name: string) {}
}

class FakeCache implements Pick<CepCacheService, 'get' | 'set'> {
  get = jest.fn<CepResponseDto | undefined, [string]>().mockReturnValue(undefined);
  set = jest.fn<void, [string, CepResponseDto]>();
}

const buildLogger = (): LoggerService => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
});

const buildBreaker = (): CircuitBreaker =>
  new CircuitBreaker({ failureThreshold: 100, cooldownMs: 60_000 });

const sampleResponse = (provider: string): CepResponseDto => ({
  cep: '01310100',
  street: 'Avenida Paulista',
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP',
  provider,
});

describe('CepService', () => {
  let primary: MockProvider;
  let secondary: MockProvider;
  let cache: FakeCache;
  let breaker: CircuitBreaker;
  let service: CepService;

  beforeEach(() => {
    primary = new MockProvider('PrimaryProvider');
    secondary = new MockProvider('SecondaryProvider');
    cache = new FakeCache();
    breaker = buildBreaker();
    service = new CepService(
      [primary, secondary],
      buildLogger(),
      cache as unknown as CepCacheService,
      breaker,
    );
  });

  it('retorna o resultado do primeiro provedor quando ele responde com sucesso', async () => {
    const expected = sampleResponse('PrimaryProvider');
    primary.fetch.mockResolvedValueOnce(expected);

    const result = await service.findByCep('01310100');

    expect(result).toEqual(expected);
    expect(primary.fetch).toHaveBeenCalledWith('01310100');
    expect(secondary.fetch).not.toHaveBeenCalled();
    expect(cache.set).toHaveBeenCalledWith('01310100', expected);
  });

  it('faz fallback para o segundo provedor quando o primeiro falha por erro técnico', async () => {
    primary.fetch.mockRejectedValueOnce(new Error('ECONNRESET'));
    const expected = sampleResponse('SecondaryProvider');
    secondary.fetch.mockResolvedValueOnce(expected);

    const result = await service.findByCep('01310100');

    expect(result).toEqual(expected);
    expect(primary.fetch).toHaveBeenCalledTimes(1);
    expect(secondary.fetch).toHaveBeenCalledTimes(1);
  });

  it('lança AllProvidersUnavailableException quando todos os provedores falham por erro técnico', async () => {
    primary.fetch.mockRejectedValueOnce(new Error('timeout'));
    secondary.fetch.mockRejectedValueOnce(new Error('500 Internal'));

    try {
      await service.findByCep('01310100');
      fail('deveria ter lançado exceção');
    } catch (err) {
      expect(err).toBeInstanceOf(AllProvidersUnavailableException);
      const ex = err as AllProvidersUnavailableException;
      expect(ex.providerErrors).toEqual(
        expect.objectContaining({
          PrimaryProvider: expect.any(String),
          SecondaryProvider: expect.any(String),
        }),
      );
    }
  });

  it('faz fast fail em CepNotFoundException, sem chamar o segundo provedor', async () => {
    primary.fetch.mockRejectedValueOnce(new CepNotFoundException('00000000'));

    await expect(service.findByCep('00000000')).rejects.toBeInstanceOf(
      CepNotFoundException,
    );

    expect(primary.fetch).toHaveBeenCalledTimes(1);
    expect(secondary.fetch).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('round-robin: chamadas consecutivas começam em provedores alternados', async () => {
    primary.fetch.mockResolvedValueOnce(sampleResponse('PrimaryProvider'));
    secondary.fetch.mockResolvedValueOnce(sampleResponse('SecondaryProvider'));

    await service.findByCep('01310100');
    expect(primary.fetch).toHaveBeenCalledTimes(1);
    expect(secondary.fetch).toHaveBeenCalledTimes(0);

    await service.findByCep('01310100');
    expect(primary.fetch).toHaveBeenCalledTimes(1);
    expect(secondary.fetch).toHaveBeenCalledTimes(1);

    primary.fetch.mockResolvedValueOnce(sampleResponse('PrimaryProvider'));
    await service.findByCep('01310100');
    expect(primary.fetch).toHaveBeenCalledTimes(2);
    expect(secondary.fetch).toHaveBeenCalledTimes(1);
  });

  it('cache HIT: não chama nenhum provedor', async () => {
    const cached = sampleResponse('PrimaryProvider');
    cache.get.mockReturnValueOnce(cached);

    const result = await service.findByCep('01310100');

    expect(result).toEqual(cached);
    expect(primary.fetch).not.toHaveBeenCalled();
    expect(secondary.fetch).not.toHaveBeenCalled();
  });

  it('circuit breaker OPEN: pula o provedor degradado e usa o próximo', async () => {
    const tightBreaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 60_000,
    });
    service = new CepService(
      [primary, secondary],
      buildLogger(),
      cache as unknown as CepCacheService,
      tightBreaker,
    );

    primary.fetch
      .mockRejectedValueOnce(new Error('boom'))
      .mockRejectedValueOnce(new Error('boom'));
    secondary.fetch
      .mockResolvedValueOnce(sampleResponse('SecondaryProvider'))
      .mockResolvedValueOnce(sampleResponse('SecondaryProvider'));

    await service.findByCep('01310100');
    await service.findByCep('01310100');
    await service.findByCep('01310100');

    primary.fetch.mockClear();
    secondary.fetch.mockClear();
    secondary.fetch.mockResolvedValueOnce(sampleResponse('SecondaryProvider'));

    await service.findByCep('01310100');
    expect(primary.fetch).not.toHaveBeenCalled();
    expect(secondary.fetch).toHaveBeenCalledTimes(1);
  });
});
