import { HttpService } from '@nestjs/axios';
import { AxiosError, AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { CepNotFoundException } from '../errors/cep.errors';
import { BrasilApiProvider } from './brasilapi.provider';

const buildHttpService = (): jest.Mocked<HttpService> =>
  ({
    get: jest.fn(),
  }) as unknown as jest.Mocked<HttpService>;

const build404 = (): AxiosError => {
  const err = new AxiosError('Request failed with status code 404');
  err.response = {
    status: 404,
    statusText: 'Not Found',
    data: { message: 'CEP não encontrado' },
    headers: {},
    config: {} as never,
  } as AxiosResponse;
  return err;
};

describe('BrasilApiProvider', () => {
  let http: jest.Mocked<HttpService>;
  let provider: BrasilApiProvider;

  beforeEach(() => {
    http = buildHttpService();
    provider = new BrasilApiProvider(http);
  });

  it('mapeia resposta válida para o contrato unificado', async () => {
    http.get.mockReturnValueOnce(
      of({
        data: {
          cep: '01310100',
          street: 'Avenida Paulista',
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
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
      provider: 'BrasilAPI',
    });
  });

  // BrasilAPI sinaliza CEP inexistente via HTTP 404.
  // Provider precisa normalizar para a exceção de domínio
  // — assim o service trata igual ao ViaCEP.
  it('lança CepNotFoundException quando BrasilAPI retorna 404', async () => {
    http.get.mockReturnValueOnce(
      throwError(() => build404()) as ReturnType<HttpService['get']>,
    );

    await expect(provider.fetch('00000000')).rejects.toBeInstanceOf(
      CepNotFoundException,
    );
  });

  it('propaga erros técnicos (≠ 404) como Error genérico', async () => {
    const err = new AxiosError('Request failed with status code 500');
    err.response = {
      status: 500,
      statusText: 'Internal Server Error',
      data: {},
      headers: {},
      config: {} as never,
    } as AxiosResponse;

    http.get.mockReturnValueOnce(
      throwError(() => err) as ReturnType<HttpService['get']>,
    );

    await expect(provider.fetch('01310100')).rejects.toThrow(
      /status code 500/,
    );
  });

  it('propaga erros não-Axios (timeout, ECONNRESET) sem confundir com 404', async () => {
    http.get.mockReturnValueOnce(
      throwError(() => new Error('timeout')) as ReturnType<HttpService['get']>,
    );

    await expect(provider.fetch('01310100')).rejects.toThrow('timeout');
  });
});
