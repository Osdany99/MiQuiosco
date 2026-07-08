export function calcularSalario(baseSalario, totalVendido) {
  const tramo = Math.floor(totalVendido / 10000)
  const bono = Math.max(0, tramo - 1) * 100
  return baseSalario + bono
}
