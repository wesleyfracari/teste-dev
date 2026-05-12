import { CepInvalidException } from '../errors/cep.errors';
import { CepValidationPipe } from './cep-validation.pipe';

describe('CepValidationPipe', () => {
  let pipe: CepValidationPipe;

  beforeEach(() => {
    pipe = new CepValidationPipe();
  });

  it('aceita 8 dígitos sem hífen', () => {
    expect(pipe.transform('01310100')).toBe('01310100');
  });

  it('aceita 8 dígitos com hífen e remove o hífen', () => {
    expect(pipe.transform('01310-100')).toBe('01310100');
  });

  it('rejeita CEP com letras', () => {
    expect(() => pipe.transform('abc12345')).toThrow(CepInvalidException);
  });

  it('rejeita CEP com menos de 8 dígitos', () => {
    expect(() => pipe.transform('12345')).toThrow(CepInvalidException);
  });

  it('rejeita CEP com mais de 8 dígitos', () => {
    expect(() => pipe.transform('123456789')).toThrow(CepInvalidException);
  });

  it('rejeita string vazia', () => {
    expect(() => pipe.transform('')).toThrow(CepInvalidException);
  });
});
