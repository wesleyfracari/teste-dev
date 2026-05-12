import { CircuitBreaker } from './circuit-breaker';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('inicia em CLOSED e permite execução', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
    expect(cb.canExecute('Provider')).toBe(true);
    expect(cb.getState('Provider')).toBe('CLOSED');
  });

  it('abre o circuito após N falhas consecutivas', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });

    cb.recordFailure('Provider');
    cb.recordFailure('Provider');
    expect(cb.canExecute('Provider')).toBe(true);

    cb.recordFailure('Provider');
    expect(cb.getState('Provider')).toBe('OPEN');
    expect(cb.canExecute('Provider')).toBe(false);
  });

  it('volta para HALF_OPEN após o cooldown e fecha em sucesso', () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000 });

    cb.recordFailure('Provider');
    cb.recordFailure('Provider');
    expect(cb.canExecute('Provider')).toBe(false);

    jest.advanceTimersByTime(1100);

    expect(cb.canExecute('Provider')).toBe(true);
    expect(cb.getState('Provider')).toBe('HALF_OPEN');

    cb.recordSuccess('Provider');
    expect(cb.getState('Provider')).toBe('CLOSED');
  });

  it('uma falha em HALF_OPEN reabre o circuito', () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000 });

    cb.recordFailure('Provider');
    cb.recordFailure('Provider');

    jest.advanceTimersByTime(1100);

    cb.canExecute('Provider'); // transiciona para HALF_OPEN
    cb.recordFailure('Provider');

    expect(cb.getState('Provider')).toBe('OPEN');
    expect(cb.canExecute('Provider')).toBe(false);
  });

  it('estado é independente por chave', () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000 });

    cb.recordFailure('A');
    cb.recordFailure('A');
    expect(cb.getState('A')).toBe('OPEN');
    expect(cb.getState('B')).toBe('CLOSED');
    expect(cb.canExecute('B')).toBe(true);
  });

  it('um sucesso zera o contador de falhas', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });

    cb.recordFailure('Provider');
    cb.recordFailure('Provider');
    cb.recordSuccess('Provider');
    cb.recordFailure('Provider');
    cb.recordFailure('Provider');

    expect(cb.canExecute('Provider')).toBe(true);
    expect(cb.getState('Provider')).toBe('CLOSED');
  });
});
