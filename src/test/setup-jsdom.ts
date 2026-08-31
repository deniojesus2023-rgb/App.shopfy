import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// @testing-library/react só se auto-registra em `afterEach` quando detecta
// esse global; como `test.globals` fica desligado neste projeto, sem isto
// o DOM de cada `it()` fica acumulado dentro do mesmo arquivo de teste.
afterEach(() => {
  cleanup();
});
