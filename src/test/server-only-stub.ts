// Stub usado apenas pelo Vitest (ver vitest.config.ts). O pacote real
// "server-only" lança incondicionalmente ao ser importado fora do bundler
// do Next.js — inclusive em Node puro — o que quebraria testes unitários
// de módulos server-only que não tocam em nada específico do Next
// (criptografia, validação de HMAC, normalização de domínio).
export {};
