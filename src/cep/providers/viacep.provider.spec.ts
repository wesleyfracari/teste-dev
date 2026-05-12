import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { CepNotFoundException } from '../errors/cep.errors';
import { ViaCepProvider } from './viacep.provider';

const buildHttpService = (): jest.Mocked<HttpService> =>
  ({
    get: jest.fn(),
  }) as unknown as jest.Mocked<HttpService>;

describe('ViaCepProvider', () => {
  let http: jest.Mocked<HttpService>;
  let provider: ViaCepProvider;

  beforeEach(() => {
    http = buildHttpService();
    provider = new ViaCepProvider(http);
  });

  it('mapeia resposta válida para o contrato unificado', async () => {
    http.get.mockReturnValueOnce(
      of({
        data: {
          cep: '01310-100',
          logradouro: 'Avenida Paulista',
          bairro: 'Bela Vista',
          localidade: 'São Paulo',
          uf: 'SP',
        },
      }) as ReturnType<HttpService['get']>,
    );

    const result = await provider.fetch('01310100');

    expect(result).toEqual({
      cep: '01310100',
      street: 'Avenida Paulista',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      provider: 'ViaCEP',
    });
  });

  // Caso peculiar do ViaCEP: HTTP 200 com `{ erro: true }` para CEP inexistente.
  // Sem essa normalização, o service trataria como sucesso e devolveria lixo.
  it('lança CepNotFoundException quando ViaCEP retorna { erro: true } com HTTP 200', async () => {
    http.get.mockReturnValueOnce(
      of({ data: { erro: true } }) as ReturnType<HttpService['get']>,
    );

    await expect(provider.fetch('00000000')).rejects.toBeInstanceOf(
      CepNotFoundException,
    );
  });

  it('aceita também { erro: "true" } como string (variação observada)', async () => {
    http.get.mockReturnValueOnce(
      of({ data: { erro: 'true' } }) as ReturnType<HttpService['get']>,
    );

    await expect(provider.fetch('00000000')).rejects.toBeInstanceOf(
      CepNotFoundException,
    );
  });

  it('propaga erros técnicos (rede, timeout) como Error genérico', async () => {
    http.get.mockReturnValueOnce(
      throwError(() => new Error('ECONNRESET')) as ReturnType<HttpService['get']>,
    );

    await expect(provider.fetch('01310100')).rejects.toThrow('ECONNRESET');
  });
});
