import { createEntity } from './_factory.js'

/**
 * shared/entities/producto.js — Entity del producto.
 *
 * Define TODO sobre la entidad producto:
 * - schema zod (create + update)
 * - endpoints REST
 * - fields del form
 * - columns de la tabla
 * - customMutations: al crear o actualizar, genera/actualiza historial de precios
 *
 * La entity es consumida por:
 * - server/api/productos/* (validación)
 * - server-offline/api/<tabla>/* (CRUD con customMutations)
 * - app/composables/useRepo, useTableData, useTableCrud, useEntityForm
 */
export const producto = createEntity({
  key: 'producto',
  tabla: 'productos',
  label: 'Producto',
  pluralLabel: 'Productos',
  puestoScoped: true,
  sync: true,
  ui: true,

  fields: {
    nombre: { type: 'string', required: true, max: 100, label: 'Nombre', form: { placeholder: 'Nombre del producto', colSpan: 'sm:col-span-2' } },
    descripcion: { type: 'text', label: 'Descripción', nullable: true, form: { input: 'text', placeholder: 'Descripción opcional', colSpan: 'sm:col-span-2' } },
    precioCompraActual: { type: 'number', required: true, min: 0, default: 0, label: 'Precio compra', form: { props: { min: 0, step: 100 } } },
    precioVentaActual: { type: 'number', required: true, min: 0, default: 0, label: 'Precio venta', form: { props: { min: 0, step: 100 } } },
    orden: { type: 'int', min: 1, default: 0, label: 'Orden', form: { props: { min: 1, step: 1 }, colSpan: 'sm:col-span-2' } },
    activo: { type: 'boolean', required: true, default: true, label: 'Activo', form: { colSpan: 'sm:col-span-2' } }
  },

  columns: [
    { accessorKey: 'id', header: 'ID', visible: false },
    { accessorKey: 'orden', header: 'Orden' },
    { accessorKey: 'nombre', header: 'Producto' },
    { accessorKey: 'descripcion', header: 'Descripción' },
    { accessorKey: 'precioCompraActual', header: 'Precio Compra', cell: 'currency' },
    { accessorKey: 'precioVentaActual', header: 'Precio Venta', cell: 'currency' },
    { accessorKey: 'activo', header: 'Estado', cell: 'activation' },
    { accessorKey: 'action', header: 'Acciones' }
  ],

  /**
   * Mutaciones custom: al crear un producto, se crea la primera entrada
   * en historial_precios. Al actualizar, si cambian los precios, se cierra
   * la entrada vigente (la de vigenteHasta null) y se crea una nueva.
   *
   * El `ctx` expone insert/update/get/queryAll genéricos (offline: sobre SQLite;
   * online: sobre Postgres), por lo que la lógica es agnóstica del backend y no
   * requiere que historial_precios tenga su propio módulo dedicado.
   *
   * `ctx.insert` devuelve la fila materializada (con id) para poder referenciarla.
   */
  customMutations: {
    create: async (ctx, data, auth) => {
      const p = await ctx.insert('productos', data)
      await ctx.insert('historial_precios', {
        productoId: p.id,
        precioCompra: Number(data.precioCompraActual ?? 0),
        precioVenta: Number(data.precioVentaActual ?? 0),
        vigenteDesde: p.creadoEn,
        vigenteHasta: null,
        cambiadoPor: auth?.usuarioActual?.value?.nombre ?? 'local'
      })
      return p
    },
    update: async (ctx, id, cambios, auth) => {
      const previo = await ctx.get('productos', id)
      const cambioCompra = cambios.precioCompraActual != null
        && Number(cambios.precioCompraActual) !== Number(previo?.precioCompraActual)
      const cambioVenta = cambios.precioVentaActual != null
        && Number(cambios.precioVentaActual) !== Number(previo?.precioVentaActual)

      await ctx.update('productos', id, cambios)

      if (cambioCompra || cambioVenta) {
        const ahora = Date.now()
        const historiales = await ctx.queryAll('historial_precios')
        const vigente = historiales.find(h => h.productoId === id && !h.vigenteHasta)

        let vigenteDesde = ahora
        if (vigente) {
          vigenteDesde = Math.max(ahora, vigente.vigenteDesde + 1)
          await ctx.update('historial_precios', vigente.id, {
            vigenteHasta: Math.max(vigenteDesde - 1, vigente.vigenteDesde)
          })
        }
        await ctx.insert('historial_precios', {
          productoId: id,
          precioCompra: Number(cambios.precioCompraActual ?? previo?.precioCompraActual ?? 0),
          precioVenta: Number(cambios.precioVentaActual ?? previo?.precioVentaActual ?? 0),
          vigenteDesde,
          vigenteHasta: null,
          cambiadoPor: auth?.usuarioActual?.value?.nombre ?? 'local'
        })
      }
      return ctx.get('productos', id)
    }
  },

  customActions: {
    historialPrecios: { path: id => `${id}/historial-precios` }
  }
})
