export const JEFE_ID_FIJO = '00000000-0000-0000-0000-000000000001'
export const PUESTO_PRINCIPAL_ID_FIJO = '00000000-0000-0000-0000-000000000002'

/**
 * Cliente centinela para transferencias de las que no se sabe el cliente.
 *
 * `transferencias.cliente_id` es NOT NULL en los dos esquemas y SQLite no
 * deja quitar ese NOT NULL sin reconstruir la tabla. En vez de abrir la puerta
 * a un NULL, la transferencia sin cliente conocido apunta a esta fila: es una
 * deuda sin dueño, no un hueco en la base.
 *
 * ID fijo por el mismo motivo que JEFE_ID_FIJO: todos los dispositivos
 * generan el mismo, así el sync (que funde por id) produce una sola fila en vez
 * de un "Sin cliente" por aparato.
 */
export const CLIENTE_SIN_CLIENTE_ID_FIJO = '00000000-0000-0000-0000-000000000003'
export const CLIENTE_SIN_CLIENTE_NOMBRE = 'Sin cliente'
export const CLIENTE_SIN_CLIENTE_NOTAS = 'Cliente centinela: usado en transferencias cuyo cliente no se conoce o se olvidó.'
