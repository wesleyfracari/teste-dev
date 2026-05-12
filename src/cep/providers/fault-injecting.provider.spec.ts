import { CepResponseDto } from '../dto/cep-response.dto';
import { CepProvider } from './cep-provider.interface';
import { FaultInjectingProvider } from './fault-injecting.provider';

const sampleResponse: CepResponseDto = {
  cep: '01310100',
  street: 'Avenida Paulista',
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP',
  provider: 'Real',
};

const buildDelegate = (): CepProvider & { fetch: jest.Mock } => ({
  name: 'Real',
  fetch: jest.fn().mockResolvedValue(sampleResponse),
});

describe('FaultInjectingProvider', () => {
  it('preserva o nome do provedor original', () => {
    const delegate = buildDelegate();
    const wrapped = new FaultInjectingProvider(delegate, () => false);

    expect(wrapped.name).toBe('Real');
  });

  it('quando shouldFail = false, delega ao provider real', async () => {
    const delegate = buildDelegate();
    const wrapped = new FaultInjectingProvider(delegate, () => false);

    const result = await wrapped.fetch('01310100');

    expect(result).toEqual(sampleResponse);
    expect(delegate.fetch).toHaveBeenCalledWith('01310100');
  });

  it('quando shouldFail = true, lança erro técnico antes de chamar o delegate', async () => {
    const delegate = buildDelegate();
    const wrapped = new FaultInjectingProvider(delegate, () => true);

    await expect(wrapped.fetch('01310100')).rejects.toThrow(
      /\[FAULT INJECTION\] Real/,
    );
    expect(delegate.fetch).not.toHaveBeenCalled();
  });

  it('shouldFail é avaliado em cada chamada (permite ligar/desligar dinamicamente)', async () => {
    const delegate = buildDelegate();
    let failNow = true;
    const wrapped = new FaultInjectingProvider(delegate, () => failNow);

    await expect(wrapped.fetch('01310100')).rejects.toThrow(/FAULT INJECTION/);

    failNow = false;
    const result = await wrapped.fetch('01310100');
    expect(result).toEqual(sampleResponse);
  });
});
