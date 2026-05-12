import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { AxiosError } from 'axios';
import { firstValueFrom, timeout } from 'rxjs';
import { CepResponseDto } from '../dto/cep-response.dto';
import { CepNotFoundException } from '../errors/cep.errors';
import { CepProvider } from './cep-provider.interface';

interface BrasilApiRawResponse {
  cep?: string;
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

@Injectable()
export class BrasilApiProvider implements CepProvider {
  readonly name = 'BrasilAPI';
  private readonly baseUrl = 'https://brasilapi.com.br/api/cep/v1';
  private readonly requestTimeoutMs = 5000;

  constructor(private readonly httpService: HttpService) {}

  async fetch(cep: string): Promise<CepResponseDto> {
    const url = `${this.baseUrl}/${cep}`;

    try {
      const { data } = await firstValueFrom(
        this.httpService
          .get<BrasilApiRawResponse>(url)
          .pipe(timeout(this.requestTimeoutMs)),
      );

      return {
        cep: (data.cep ?? cep).replace(/-/g, ''),
        street: data.street ?? '',
        neighborhood: data.neighborhood ?? '',
        city: data.city ?? '',
        state: data.state ?? '',
        provider: this.name,
      };
    } catch (err) {
      // BrasilAPI usa HTTP 404 para CEPs inexistentes; normaliza.
      if (err instanceof AxiosError && err.response?.status === 404) {
        throw new CepNotFoundException(cep);
      }
      throw err;
    }
  }
}
