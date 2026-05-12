/**
 * Contrato único de resposta, independente do provedor que respondeu.
 * Cada provider mapeia sua resposta nativa para esta forma.
 */
export interface CepResponseDto {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  provider: string;
}
