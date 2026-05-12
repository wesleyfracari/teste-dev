/**
 * Exceções de domínio do módulo CEP.
 *
 * Não conhecem HTTP nem estendem exceções do NestJS — a tradução para
 * códigos de status acontece somente no GlobalExceptionFilter, mantendo
 * service e controller livres de acoplamento com a camada HTTP.
 */

export class CepNotFoundException extends Error {
  constructor(public readonly cep: string) {
    super(`CEP ${cep} não encontrado`);
    this.name = 'CepNotFoundException';
  }
}

export class CepInvalidException extends Error {
  constructor(public readonly cep: string) {
    super(`CEP ${cep} possui formato inválido`);
    this.name = 'CepInvalidException';
  }
}

export class AllProvidersUnavailableException extends Error {
  constructor(
    public readonly cep: string,
    public readonly providerErrors: Record<string, string>,
  ) {
    super(
      `Todos os provedores falharam ao consultar o CEP ${cep}: ${JSON.stringify(providerErrors)}`,
    );
    this.name = 'AllProvidersUnavailableException';
  }
}
