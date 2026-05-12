/** Token de injeção do CircuitBreaker no NestJS DI. */
export const CIRCUIT_BREAKER = 'CIRCUIT_BREAKER';

type State = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface BreakerStats {
  state: State;
  consecutiveFailures: number;
  openUntil: number;
}

export interface CircuitBreakerOptions {
  /** Quantas falhas consecutivas até abrir o circuito. */
  failureThreshold: number;
  /** Quanto tempo (ms) o circuito permanece OPEN antes de virar HALF_OPEN. */
  cooldownMs: number;
}

/**
 * Circuit Breaker por chave (geralmente nome do provedor).
 * Estado em memória — limitação consciente para o escopo deste serviço.
 */
export class CircuitBreaker {
  private readonly stats = new Map<string, BreakerStats>();

  constructor(private readonly options: CircuitBreakerOptions) {}

  canExecute(key: string): boolean {
    const stat = this.getOrInit(key);

    if (stat.state === 'OPEN') {
      if (Date.now() >= stat.openUntil) {
        stat.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }

    return true;
  }

  recordSuccess(key: string): void {
    const stat = this.getOrInit(key);
    stat.state = 'CLOSED';
    stat.consecutiveFailures = 0;
    stat.openUntil = 0;
  }

  recordFailure(key: string): void {
    const stat = this.getOrInit(key);
    stat.consecutiveFailures += 1;

    if (stat.consecutiveFailures >= this.options.failureThreshold) {
      stat.state = 'OPEN';
      stat.openUntil = Date.now() + this.options.cooldownMs;
    }
  }

  getState(key: string): State {
    return this.getOrInit(key).state;
  }

  private getOrInit(key: string): BreakerStats {
    let stat = this.stats.get(key);
    if (!stat) {
      stat = { state: 'CLOSED', consecutiveFailures: 0, openUntil: 0 };
      this.stats.set(key, stat);
    }
    return stat;
  }
}
