# Crear una nueva entidad en MiQuiosco

> **Tiempo estimado:** 15-30 minutos según la complejidad.
> **Patrón actual (config-based):** la tabla se describe una vez en
> `shared/tables.js` y cada capa la consume: rutas Nitro explícitas en
> `server/api/<recurso>/`, módulo offline en `app/server-offline/index.js`,
> cliente vía `useRepo(config)` + `useTableCrud` + `useTableData`.

Ejemplo de referencia en todo el doc: **productos**
(`server/api/productos/`, `app/pages/productos.vue`).

---

## 1. Conceptos clave

| Concepto | Dónde vive | Qué es |
|---|---|---|
| **Config de tabla** | `shared/tables.js` | Objeto `{ tabla, endpoints, puestoScoped, label, syncNumeric, insertOnly }`. Fuente única de verdad que comparten server, cliente y sync. |
| **Schema zod** | `shared/schemas/<recurso>.js` | Validación compartida cliente/servidor (ej. `productoSchema`). |
| **Helpers CRUD server** | `server/utils/crud.ts` | `crudList`, `crudGet`, `crudCreate`, `crudPatch`, `crudRemove`. Las rutas son archivos Nitro explícitos que los llaman. |
| **customMutations** | `shared/mutations/*.ts` | Lógica multi-tabla (ej. historial de precios) que corre igual online (Drizzle/pg) y offline (SQLite) vía un `ctx` agnóstico. |
| **Módulo offline** | `app/server-offline/index.js` (`OFFLINE_CONFIGS`) | Config por tabla: `defaults`, `puestoScoped`, `customMutations`, más `overrides` (`requireRole`, `beforeCreate`, `actions`, etc.). |
| **`useRepo(config)`** | `app/composables/useRepo.js` | Dispatch online/offline. Expone `create, read, readAll, update, patch, remove`. **Recibe el objeto config, no un string.** |
| **`useTableCrud` / `useTableData`** | `app/composables/` | Modales CRUD (crear/editar/borrar) y carga de datos con filtros/paginación para `BaseTable`. |
| **`puestoScoped`** | flag del config | Si `true`, el list filtra por `puestoId` del usuario y el create lo inyecta. |
| **`insertOnly`** | flag del config | Si `true`, la tabla solo admite inserts (ej. `pagos_fiado`, líneas e historial). |
| **`syncNumeric`** | flag del config | Campos numéricos que el sync normaliza (evita `"100"` vs `100` entre SQLite y Postgres). |

Componentes base (auto-importados, viven en `app/components/base/`):
`BaseTable`, `BaseForm`, `BaseHeaderPage`, `BaseDialog`, `BaseButtonActions`, etc.
**Reutilizarlos siempre** en vez de crear UI propia (ver `AGENTS.md`).

---

## 2. El patrón en 5 pasos

### Paso 1 · Tabla física en ambos backends

- **Postgres:** añadir la tabla en `server/database/schema.ts` y generar
  migración con `pnpm db:generate` (nunca editar el SQL de `drizzle/` a mano).
- **SQLite offline:** añadir la tabla en `app/server-offline/db/schema.ts`
  (+ `pnpm db:generate:sqlite` si aplica).

Las columnas deben coincidir en nombre y tipo con lo que valida el schema
zod del paso 3.

### Paso 2 · Registrar el config en `shared/tables.js`

```js
export const miEntidad = {
  tabla: 'mi_entidad',
  endpoints: endpoint('mi-entidad'), // → /api/mi-entidad y /api/mi-entidad/:id
  puestoScoped: true,
  label: { singular: 'Mi entidad', plural: 'Mis entidades', gender: 'f' },
  syncNumeric: ['monto'],
  insertOnly: false
}
```

`endpoints` usa guiones en la URL (`cuentas-fiado`) aunque la tabla use
guion bajo (`cuentas_fiado`): respeta esa convención.

### Paso 3 · Schema zod en `shared/schemas/`

```js
// shared/schemas/miEntidad.js
import { z } from 'zod'

export const miEntidadSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(100),
  monto: z.number().min(0).default(0),
  activo: z.boolean().default(true)
})
```

### Paso 4 · Rutas Nitro en `server/api/<recurso>/`

Un archivo por operación (convención Nitro). Ejemplo real
(`server/api/productos/index.post.ts`):

```ts
import { miEntidadSchema } from '#shared/schemas/miEntidad'
import { crudCreate } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  return await crudCreate(
    { tabla: 'mi_entidad', schema: miEntidadSchema, puestoScoped: true },
    { body, auth }
  )
})
```

Archivos típicos: `index.get.ts` (`crudList`), `index.post.ts` (`crudCreate`),
`[id].get.ts` (`crudGet`), `[id].patch.ts` (`crudPatch`), `[id].delete.ts`
(`crudRemove`). `requireRole` / `requireAuth` salen de `server/utils/auth.ts`.

### Paso 5 · Módulo offline (si la tabla se usa sin conexión)

Añadir entrada en `OFFLINE_CONFIGS` (`app/server-offline/index.js`):

```js
{
  config: {
    tabla: 'mi_entidad',
    defaults: { monto: 0, activo: true },
    puestoScoped: TABLES.mi_entidad.puestoScoped
  },
  overrides: {
    requireRole: 'jefe'
  }
}
```

### Paso 6 (solo con UI) · Página con `BaseTable` + `BaseForm`

Ejemplo real abreviado (`app/pages/productos.vue`):

```vue
<script setup>
import { productoSchema } from '../../shared/schemas/producto'
import { productos as config } from '../../shared/tables'

definePageMeta({ middleware: ['jefe'] })

const fields = [
  { name: 'nombre', label: 'Nombre', type: 'text', required: true },
  { name: 'precioVentaActual', label: 'Precio venta', type: 'number', required: true }
]
const columns = [
  { accessorKey: 'nombre', header: 'Producto' },
  { accessorKey: 'precioVentaActual', header: 'Precio Venta', cell: 'currency' },
  { accessorKey: 'activo', header: 'Estado', cell: 'activation' },
  { accessorKey: 'action', header: 'Acciones' }
]
const tableRef = ref(null)
const formRef = ref(null)
const form = ref({ id: null, nombre: '', precioVentaActual: 0, activo: true })
</script>

<template>
  <BaseHeaderPage
    :title="config.label.plural"
    description="..."
    :title-button="'Nuevo ' + config.label.singular"
    @new="tableRef.openAdd()"
  >
    <BaseTable ref="tableRef" v-model="form" :config="config" :columns="columns" :form-ref="formRef">
      <template #form>
        <BaseForm ref="formRef" v-model="form" :fields="fields" :schema="productoSchema" />
      </template>
    </BaseTable>
  </BaseHeaderPage>
</template>
```

`BaseTable` internamente usa `useTableData` (carga) y `useTableCrud`
(modales) con el mismo `config`. Cell renderers disponibles: `currency`,
`activation` (switch que llama PATCH), `boolean` (badge).

---

## 3. Caso especial: `customMutations` (lógica multi-tabla)

Si crear/actualizar debe tocar otras tablas (ej. `historial_precios` al crear
un producto), se declara en `shared/mutations/<recurso>.ts` y se pasa tanto a
la ruta online como al módulo offline. Ejemplo real
(`shared/mutations/producto.ts`, `server/api/productos/index.post.ts`):

```ts
export async function createProductoMut(ctx: any, data: any, auth: any) {
  const p = await ctx.insert('productos', data)
  await ctx.insert('historial_precios', {
    productoId: p.id,
    precioCompra: Number(data.precioCompraActual ?? 0),
    precioVenta: Number(data.precioVentaActual ?? 0),
    vigenteDesde: p.creadoEn,
    vigenteHasta: null,
    cambiadoPor: auth?.usuarioActual?.value?.id
  })
  return p
}
```

API del `ctx` (idéntica online y offline): `ctx.insert(tabla, data)`,
`ctx.update(tabla, id, cambios)`, `ctx.get(tabla, id)`, `ctx.queryAll(tabla)`.

---

## 4. Caso especial: acciones custom offline

Si el módulo offline necesita operaciones extra (ej. `getHistorial` en
productos), se declaran en `actions` dentro de los `overrides` de
`OFFLINE_CONFIGS`:

```js
overrides: {
  actions: {
    getHistorial: async (productoId) => {
      const db = useDb()
      const all = await db.queryAll('historial_precios')
      return all.filter(h => h.productoId === productoId)
    }
  }
}
```

Otros overrides disponibles: `requireRole`, `beforeCreate`, `beforeUpdate`,
`serialize`, `listFilter`. Para lógica online-only, la particularidad va
directa en el archivo de ruta Nitro correspondiente.

---

## 5. Checklist

- [ ] Tabla en `server/database/schema.ts` + migración (`pnpm db:generate`).
- [ ] Tabla en `app/server-offline/db/schema.ts` (+ `pnpm db:generate:sqlite` si aplica).
- [ ] Config en `shared/tables.js` (con `endpoints` en kebab-case si la tabla lleva guion bajo).
- [ ] Schema zod en `shared/schemas/<recurso>.js`.
- [ ] Rutas en `server/api/<recurso>/` con `requireRole`/`requireAuth` según corresponda.
- [ ] Entrada en `OFFLINE_CONFIGS` si la tabla se usa offline (con `defaults` y `customMutations` si aplica).
- [ ] (Opcional) Página en `app/pages/` con `BaseHeaderPage` + `BaseTable` + `BaseForm`.
- [ ] `pnpm lint && pnpm test && pnpm typecheck` en verde.

---

## 6. Errores comunes

| Error | Causa | Solución |
|---|---|---|
| `Error: no se puede usar useRepo con string` | Llamaste `useRepo('mi_entidad')`. | Pasa el config: `useRepo(miEntidad)` desde `shared/tables.js`. |
| `404 en /api/mi-entidad` | Falta el archivo de ruta o la tabla no existe en Postgres. | Crea `server/api/mi-entidad/index.get.ts` y verifica schema + migración. |
| Datos no visibles offline | Falta la entrada en `OFFLINE_CONFIGS` o la tabla SQLite. | Agrégala en `app/server-offline/index.js` + schema SQLite. |
| Números llegan como texto al sync | Campo numérico no listado en `syncNumeric`. | Añádelo al config en `shared/tables.js`. |
| `405` al borrar/pagar | La tabla es `insertOnly` por diseño (líneas, pagos). | Es lo esperado: esas tablas no admiten update/delete. |
