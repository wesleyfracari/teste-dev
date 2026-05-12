import { CepResponseDto } from '../dto/cep-response.dto';

/**
 * Contrato de provedor de CEP — Strategy Pattern.
 * O CepService depende somente desta interface; o CepModule
 * é o único lugar que conhece as implementações concretas.
 */
export interface CepProvider {
  readonly name: string;
  fetch(cep: string): Promise<CepResponseDto>;
}

/** Token de injeção do array de provedores disponíveis. */
export const CEP_PROVIDERS = 'CEP_PROVIDERS';
