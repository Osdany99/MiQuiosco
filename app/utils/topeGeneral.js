/**
 * app/utils/topeGeneral.js — Consumo conjunto por producto en un cuadre
 * (fiado + transferencias + ajustes) para validar el tope de ventas local.
 * En modo online la validación la hace el servidor (server/utils/fiadoTope.ts).
 */

import { calcularExcesoTope, sumarPorProducto } from '../../shared/fiadoTope.js'

function sumarAlMapa(mapa, filas) {
  for (const f of filas) {
    if (!f?.productoId) continue
    const actual = mapa.get(f.productoId) ?? 0
    mapa.set(f.productoId, actual + (Number(f.cantidad) || 0))
  }
}

/**
 * Consumo total por producto del cuadre (unidades ya apartadas por fiado,
 * transferencias y ajustes), excluyendo las entidades dadas.
 *
 * @param {Object} opts
 * @param {string} opts.cuadreId
 * @param {Object} opts.repos — repos locales mode-aware ya resueltos:
 *   { cuadreItemsRepo, cuentasRepo, cuentasItemsRepo, transferenciasRepo,
 *     transferenciaItemsRepo, ajustesRepo }
 * @param {Object} [opts.excluir] — { cuentaIds, transferenciaIds, ajusteIds }
 * @returns {Promise<Map<string, number>>}
 */
export async function consumoPorProductoEnCuadreLocal({ cuadreId, repos, excluir = {} }) {
  const {
    cuentasRepo,
    cuentasItemsRepo,
    transferenciasRepo,
    transferenciaItemsRepo,
    ajustesRepo
  } = repos
  const excluirCuentaIds = excluir.cuentaIds ?? []
  const excluirTransferenciaIds = excluir.transferenciaIds ?? []
  const excluirAjusteIds = excluir.ajusteIds ?? []

  const consumidos = new Map()

  // Fiado
  const todasCuentas = await cuentasRepo.readAll()
  const delCuadre = todasCuentas.filter(c => c.cuadreOrigenId === cuadreId && !excluirCuentaIds.includes(c.id))
  const ids = delCuadre.map(c => c.id)
  if (ids.length) {
    const todosItems = await cuentasItemsRepo.readAll()
    sumarAlMapa(consumidos, todosItems.filter(i => ids.includes(i.cuentaFiadoId)))
  }

  // Transferencias
  const todasTransferencias = await transferenciasRepo.readAll()
  const transfers = todasTransferencias.filter(t => t.cuadreId === cuadreId && !excluirTransferenciaIds.includes(t.id))
  const tfIds = transfers.map(t => t.id)
  if (tfIds.length) {
    const todosItems = await transferenciaItemsRepo.readAll()
    sumarAlMapa(consumidos, todosItems.filter(i => tfIds.includes(i.transferenciaId)))
  }

  // Ajustes (regalos/descuentos también consumen unidades del tope)
  const todosAjustes = await ajustesRepo.readAll()
  sumarAlMapa(consumidos, todosAjustes.filter(a => a.cuadreId === cuadreId && !excluirAjusteIds.includes(a.id)))

  return consumidos
}

/**
 * Valida el tope local: vendido del cuadre vs consumo ya apartado (+ nuevo).
 * Devuelve mensaje de error o null si cabe.
 */
export async function validarTopeGeneralLocal({ cuadreId, items, repos, excluir = {}, concepto = 'esta operación' }) {
  const { cuadreItemsRepo, ...resto } = repos
  const [vendidos, consumidos] = await Promise.all([
    (async () => {
      const itemsCuadre = await cuadreItemsRepo.readAll({ query: { cuadreId } })
      return sumarPorProducto(itemsCuadre)
    })(),
    consumoPorProductoEnCuadreLocal({ cuadreId, repos: resto, excluir })
  ])

  const exceso = calcularExcesoTope(vendidos, consumidos, items)
  if (!exceso) return null
  const yaConsumido = Number(consumidos.get(exceso.productoId) ?? 0)
  return `Tope excedido: quedan ${exceso.disponible} unidades disponibles para ${concepto} (vendido ${exceso.disponible + yaConsumido}, incluye fiado/transferencia/ajustes).`
}
