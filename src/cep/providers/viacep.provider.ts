import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom, timeout } from 'rxjs';
import { CepResponseDto } from '../dto/cep-response.dto';
import { CepNotFoundException } from '../errors/cep.errors';
import { CepProvider } from './cep-provider.interface';

interface ViaCepRawResponse {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean | string;
}

@Injectable()
export class ViaCepProvider implements CepProvider {
  readonly name = 'ViaCEP';
  private readonly baseUrl = 'https://viacep.com.br/ws';
  private readonly requestTimeoutMs = 5000;

  constructor(private readonly httpService: HttpService) {}

  async fetch(cep: string): Promise<CepResponseDto> {
    const url = `${this.baseUrl}/${cep}/json/`;

    const { data } = await firstValueFrom(
      this.httpService
        .get<ViaCepRawResponse>(url)
        .pipe(timeout(this.requestTimeoutMs)),
    );

    // ViaCEP retorna HTTP 200 com { erro: true } para CEPs inexistentes;
    // normaliza para a exceção de domínio.
    if (data?.erro) {
      throw new CepNotFoundException(cep);
    }

    return {
      cep: (data.cep ?? cep).replace(/-/g, ''),
      street: data.logradouro ?? '',
      neighborhood: data.bairro ?? '',
      city: data.localidade ?? '',
      state: data.uf ?? '',
      provider: this.name,
    };
  }
}
