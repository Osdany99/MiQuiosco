/**
 * Mutex para ejecutar tests en serie dentro de un mismo archivo.
 *
 * `node --test --test-concurrency=1` solo controla cuantos ARCHIVOS corren a la
 * vez. Los `it` de un mismo archivo siguen siendo concurrentes, asi que dos
 * tests que mutan el mismo estado global (crear/desactivar usuarios, saturar el
 * rate limit) se pisan y producen fallos no deterministas.
 *
 * Uso dentro de un archivo de test:
 *
 *   import { enSerie } from './secuencial.js'
 *   it('...', () => enSerie(async () => { ... }))
 *
 * Cada test espera a que termine el anterior. La cola nunca queda rechazada, para
 * que un fallo no bloquee los siguientes.
 */

let cola = Promise.resolve()

export function enSerie(fn) {
  const resultado = cola.then(fn, fn)
  cola = resultado.then(() => undefined, () => undefined)
  return resultado
}
