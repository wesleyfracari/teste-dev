# Teste Técnico — CEP API (Monest)

API de consulta de CEP em NestJS + TypeScript com fallback resiliente entre provedores externos (ViaCEP e BrasilAPI).

---

## Como rodar

```bash
npm install
npm run build
npm run start:dev          # ou: npm run start:prod
```

A API sobe em `http://localhost:3000`. Endpoint único:

```
GET /cep/:cep
```

---

## Decisões de arquitetura

### Strategy via token de injeção

O `CepService` recebe `@Inject(CEP_PROVIDERS) providers: CepProvider[]` e nunca conhece as classes concretas. **Adicionar uma terceira API é apenas:**

1. Implementar `CepProvider` em `src/cep/providers/<novo>.provider.ts`
2. Adicionar a classe ao `useFactory` do token `CEP_PROVIDERS` em `cep.module.ts`

Service, controller e filter ficam intocados. Princípio Open/Closed respeitado.

### Camadas isoladas

```
Controller  → valida input HTTP, delega ao service
Pipe        → barreira de entrada (regex de CEP)
Service     → orquestra cache, breaker, providers e fallback
Providers   → cada um sabe falar com uma API externa específica
Filter      → traduz exceções de domínio para HTTP
Cache       → respostas em memória com TTL
Breaker     → isola provedor degradado por janela de cooldown
```

O `CepService` lança apenas exceções de domínio (`CepNotFoundException`, `AllProvidersUnavailableException`) — nunca conhece HTTP. Quem traduz é o `GlobalExceptionFilter`.

### Resiliência em camadas

| Camada               | O que faz                                                  | Quando ajuda                                                |
|----------------------|------------------------------------------------------------|-------------------------------------------------------------|
| Cache em memória     | Devolve CEP já consultado sem chamar API externa           | Reduz chamadas em ~95%; serve mesmo com providers caídos    |
| Round-robin          | Distribui carga entre provedores                           | Evita sobrecarregar um único provedor                       |
| Timeout (RxJS)       | Aborta requisição lenta após 5s                            | Garante que API "morta" não trava a request                 |
| Fallback ordenado    | Se um falha tecnicamente, tenta o próximo                  | Indisponibilidade pontual (timeout, 5xx)                    |
| Circuit breaker      | Após N falhas consecutivas, pula provedor por cooldown     | Degradação sustentada — não paga timeout repetido           |
| Fast fail (negócio)  | `CepNotFoundException` interrompe — não tenta o próximo    | CEP inexistente é resposta correta, não falha               |

### Tradução de erros para HTTP

| Exceção                            | HTTP | Significado                                       |
|------------------------------------|------|---------------------------------------------------|
| `CepInvalidException`              | 400  | Cliente mandou formato inválido                   |
| `CepNotFoundException`             | 404  | CEP não existe nas bases consultadas              |
| `AllProvidersUnavailableException` | 503  | Nossa API está saudável, dependências externas não|
| Qualquer outra                     | 500  | Bug — logado com stack trace                      |

**Por que 503 e não 500 quando todos os provedores caem?** 500 dispara alerta de "deploy quebrado / bug". 503 dispara alerta de "dependência externa". A distinção é crítica para quem opera o sistema.

### Observabilidade

- **Logs estruturados via `nest-winston`**: cada evento inclui `cep`, `provider`, `error` e nível.
- **Correlation ID**: middleware gera um `requestId` por request (UUID), propagado via `AsyncLocalStorage` e injetado automaticamente em todos os logs daquela request. O ID também volta como header `x-request-id` na resposta.
- **Format por ambiente**: `nestLike` colorido em desenvolvimento, JSON puro em produção.

---

## Como demonstrar (script de demo local)

### 1. Cenários básicos

```bash
# 200 — endereço completo, provider que respondeu na resposta
curl http://localhost:3000/cep/01310100

# 200 — hífen aceito, segunda chamada vem do CACHE (sem chamar API externa)
curl http://localhost:3000/cep/01310-100

# 404 — CEP inexistente, fast fail
curl http://localhost:3000/cep/00000000

# 400 — formato inválido, rejeitado antes de qualquer chamada externa
curl http://localhost:3000/cep/abc
```

Faça duas chamadas seguidas do mesmo CEP e observe nos logs do servidor:
- 1ª chamada: `Consultando provedor de CEP` → `Provedor respondeu com sucesso`
- 2ª chamada: `Cache HIT — resposta servida sem chamar provedor externo`

Faça duas chamadas de CEPs diferentes seguidas e observe que **o `provider` na resposta alterna** — round-robin funcionando.

### 2. Correlation ID

Envie um `x-request-id` customizado e veja-o aparecer em **todos os logs daquela request**:

```bash
curl -H "x-request-id: minha-trace-id" http://localhost:3000/cep/01310100
```

Nos logs do servidor todas as linhas dessa request terão `requestId: 'minha-trace-id'`. Sem header customizado, um UUID é gerado automaticamente.

### 3. Demo de fallback e circuit breaker (fault injection)

Para demonstrar resiliência **ao vivo** sem precisar derrubar a internet, suba a API com a env `FAIL_PROVIDERS`:

```bash
# Linux/Mac
FAIL_PROVIDERS=ViaCEP npm run start:prod

# Windows PowerShell
$env:FAIL_PROVIDERS='ViaCEP'; npm run start:prod
```

O ViaCEP passa a lançar erro técnico simulado em toda chamada. Faça **4 requisições** em CEPs diferentes:

```bash
curl http://localhost:3000/cep/01310100
curl http://localhost:3000/cep/04538132
curl http://localhost:3000/cep/20040020
curl http://localhost:3000/cep/30130010
```

Você verá nos logs:

1. **Chamadas 1–3**: ViaCEP é tentado quando é a vez dele (round-robin), falha (`Provedor falhou — tentando próximo`), cai pro BrasilAPI com sucesso. O contador do breaker sobe.
2. **Após a 3ª falha consecutiva**: log mostra `breakerState: 'OPEN'`.
3. **Chamadas seguintes**: ViaCEP é **pulado** (log `Circuit breaker OPEN — provedor pulado`) — não paga mais o custo de chamar provedor sabidamente fora.
4. **Após 30s de cooldown**: breaker passa para `HALF_OPEN`, permite uma tentativa de teste; sucesso fecha, falha reabre.

Para forçar **ambos** a falharem (503):

```bash
FAIL_PROVIDERS=ViaCEP,BrasilAPI npm run start:prod
curl -i http://localhost:3000/cep/01310100   # HTTP 503 com detail dos erros
```

### 4. Testes

```bash
npm test
```

5 suítes, 28 testes:

- `cep.service.spec.ts` — round-robin, fallback, fast fail, cache, breaker, fault injection (8 testes)
- `circuit-breaker.spec.ts` — máquina de estados CLOSED→OPEN→HALF_OPEN→CLOSED (6 testes)
- `viacep.provider.spec.ts` — normalização do `{ erro: true }` HTTP 200 (4 testes)
- `brasilapi.provider.spec.ts` — normalização do HTTP 404 (4 testes)
- `cep-validation.pipe.spec.ts` — regex e sanitização (6 testes)

---

## Variáveis de ambiente

| Variável            | Default | Função                                              |
|---------------------|---------|-----------------------------------------------------|
| `PORT`              | 3000    | Porta HTTP                                          |
| `NODE_ENV`          | —       | `production` muda formato dos logs para JSON puro   |
| `LOG_LEVEL`         | info    | `debug` / `info` / `warn` / `error`                 |
| `CACHE_TTL_HOURS`   | 24      | TTL de cache de CEP                                 |
| `BREAKER_THRESHOLD` | 3       | Falhas consecutivas para abrir o circuito           |
| `BREAKER_COOLDOWN_MS` | 30000 | Tempo (ms) que o circuito fica OPEN antes de testar |
| `FAIL_PROVIDERS`    | —       | Lista de providers a forçar falha (demo). Ex: `ViaCEP,BrasilAPI` |

---

## Limitações assumidas (trade-offs conscientes)

- **Cache e breaker em memória, por instância.** Em multi-pod cada réplica tem seu próprio estado. A evolução natural seria Redis compartilhado — fora do escopo do teste.
- **Round-robin local.** Mesma limitação. Sob alta concorrência numa única instância, leituras concorrentes do índice podem perder precisão (Node single-thread mitiga, mas não elimina). Aceito explicitamente para o escopo.
- **Sem retry com backoff** dentro do mesmo provider. O fallback já cobre indisponibilidade pontual; um retry adicional aumentaria latência sem ganho claro neste cenário.
- **Sem rate limiting / API key** — o teste não pede e os provedores são públicos.

---

## Estrutura

```
src/
  cep/
    cache/cep-cache.service.ts
    circuit-breaker/circuit-breaker.ts (+ .spec)
    dto/cep-response.dto.ts
    errors/cep.errors.ts
    pipes/cep-validation.pipe.ts (+ .spec)
    providers/
      cep-provider.interface.ts
      viacep.provider.ts (+ .spec)
      brasilapi.provider.ts (+ .spec)
    cep.controller.ts
    cep.service.ts (+ .spec)
    cep.module.ts
  common/
    request-context.ts
    request-context.middleware.ts
  filters/global-exception.filter.ts
  app.module.ts
  main.ts
```
