# Crear una nueva entidad en MiQuiosco

> **Tiempo estimado:** 5-15 minutos según la complejidad.
> **Archivos a tocar:** 2-3 archivos (entity + barrel), más opcionales para particularidades.

El proyecto está diseñado para que añadir una tabla nueva al dominio requiera escribir
**lo mínimo indispensable**. Esta guía explica el patrón, los archivos a tocar y
los casos especiales (UI, custom mutations, particularidades por backend).

---

## 1. Conceptos clave

| Concepto | Descripción |
|---|---|
| **Entity** | Objeto JS plano en `shared/entities/<nombre>.js` que describe TODO sobre una tabla: schema zod, fields del form, columns de la tabla, customMutations, customActions. Fuente única de verdad. |
| **ALL_ENTITIES** | Array en `shared/entities/index.js` que lista todas las entities. Cualquier factory (online, offline, sync) las itera automáticamente. |
| **customMutations** | Lógica de create/update compartida entre online (Postgres) y offline (SQLite). Se ejecuta con un `ctx` agnóstico del backend. Sirve para reglas de negocio que tocan varias tablas (ej. historial de precios al crear un producto). |
| **customActions** | Endpoints REST adicionales declarados en la entity, autogenerados por la factory online. Ej: `PATCH /api/usuarios/:id/pin`. |
| **Factory online** | `server/middleware/05.entity-factory.ts` + `server/utils/entityHandlers.js`. Genera los handlers REST CRUD estándar a partir de la entity. |
| **Factory offline** | `app/server-offline/api/_factory.js` + `app/server-offline/index.js`. Genera el módulo CRUD offline (SQLite) con la misma entity. |
| **puestoScoped** | Flag de la entity: si `true`, filtra list por `puestoId` del usuario e inyecta `puestoId` al crear. |
| **ui** | Flag: si `false`, la entity es interna (sin página CRUD, sin endpoints REST). El sync la maneja. |

---

## 2. El patrón en 3 pasos

### Paso 1 · Crear la entity

`shared/entities/miEntidad.js`:

```js
import { createEntity } from './_factory.js'

export const miEntidad = createEntity({
  key: 'miEntidad',           // singular, camelCase
  tabla: 'mi_entidad',        // nombre de tabla (snake_case, plural)
  label: 'Mi Entidad',
  pluralLabel: 'Mis Entidades',
  puestoScoped: true,         // si filtra por puestoId
  sync: true,                 // si se sincroniza (true por defecto)
  ui: true,                   // si tiene UI (false para entidades internas)

  fields: {
    nombre: { type: 'string', required: true, max: 100, label: 'Nombre' },
    descripcion: { type: 'text', nullable: true, label: 'Descripción' },
    cantidad: { type: 'int', required: true, min: 0, default: 0, label: 'Cantidad' },
    activo: { type: 'boolean', required: true, default: true, label: 'Activo' },
    tipo: {
      type: 'enum',
      values: ['a', 'b', 'c'],
      required: true,
      default: 'a',
      label: 'Tipo',
      form: { items: [{ label: 'Tipo A', value: 'a' }, { label: 'Tipo B', value: 'b' }, { label: 'Tipo C', value: 'c' }] }
    }
  },

  columns: [
    { accessorKey: 'id', header: 'ID', visible: false },
    { accessorKey: 'nombre', header: 'Nombre' },
    { accessorKey: 'cantidad', header: 'Cantidad' },
    { accessorKey: 'tipo', header: 'Tipo' },
    { accessorKey: 'activo', header: 'Estado', cell: 'activation' },
    { accessorKey: 'action', header: 'Acciones' }
  ]
})
```

Tipos de field disponibles: `string`, `text`, `number`, `int`, `boolean`, `date`, `uuid`, `enum`.

Validadores: `required`, `min`, `max`, `default`, `nullable`. Para enums: `values: [...]`.

Cell renderers automáticos en la tabla: `currency`, `activation` (USwitch que llama PATCH), `boolean` (badge).

### Paso 2 · Registrar en el barrel

`shared/entities/index.js`:

```js
import { miEntidad } from './miEntidad.js'

export { miEntidad }
// ... otras exports
export const ALL_ENTITIES = [
  // ... otras entities
  miEntidad
]
```

### Paso 3 · (Solo si tiene UI) Crear la página

`app/pages/mi-entidad.vue`:

```vue
<script setup>
import { miEntidad } from '~~/shared/entities'

definePageMeta({ middleware: ['jefe'] })

const { entity, columns, form, submitFields, tableRef, formRef, modalTitle } = useEntityTable(miEntidad)
</script>

<template>
  <BaseHeaderPage
    title="Mis Entidades"
    description="..."
    title-button="Nueva Mi Entidad"
    @new="tableRef.openAdd()"
  >
    <BaseTable
      ref="tableRef"
      v-model="form"
      :entidad="entity"
      :columns="columns"
      :modal-title="modalTitle"
      :form-ref="formRef"
      :submit-fields="submitFields"
    >
      <template #form>
        <BaseEntityForm ref="formRef" :entity="entity" v-model="form" />
      </template>
    </BaseTable>
  </BaseHeaderPage>
</template>
```

**Eso es todo.** Con estos 3 pasos ya tienes:

- Endpoint `GET /api/mi_entidad` (lista filtrada por puestoId)
- Endpoint `GET /api/mi_entidad/:id`
- Endpoint `POST /api/mi_entidad` (con `puestoId` inyectado)
- Endpoint `PATCH /api/mi_entidad/:id`
- Endpoint `PUT /api/mi_entidad/:id`
- Endpoint `DELETE /api/mi_entidad/:id`
- Módulo offline `getModulo('mi_entidad')` con las mismas operaciones
- Sync: la entity se incluye automáticamente en push/pull
- Página CRUD con tabla, filtros, modal de edición, toggle de activo, etc.
- Form auto-derivado de `fields` con validación zod

---

## 3. Tabla en la base de datos

La entity es solo la **descripción JS** de la tabla. La tabla física debe existir en:

- **Postgres (online):** `server/database/schema.ts` y la migración Drizzle correspondiente.
- **SQLite (offline):** `app/server-offline/db/schema.ts` y la migración Drizzle SQLite.

Las columnas deben coincidir (en nombre y tipo) con los `fields` de la entity, en camelCase. La factory online usa los nombres camel directamente (Drizzle los traduce a snake). La factory offline también (con `pruneToColumns` para columnas que no existen, como timestamps opcionales).

---

## 4. Flags que cambian el comportamiento

| Flag | Default | Significado |
|---|---|---|
| `puestoScoped` | `false` | Si `true`, filtra list por `puestoId` del usuario e inyecta `puestoId` en create. |
| `sync` | `true` | Si `true`, la entity se incluye en el push/pull de sincronización. |
| `ui` | `true` | Si `false`, la entity NO genera endpoints REST (solo sync la maneja). Útil para entidades internas como `historial_precios`. |

---

## 5. Caso especial: customMutations (lógica multi-tabla)

Si al crear/actualizar la entity hay que tocar otras tablas (ej. crear entrada en `historial_precios` al crear un `producto`), declaras `customMutations` en la entity. La factory online y offline las invocan automáticamente con un `ctx` agnóstico del backend.

```js
export const producto = createEntity({
  // ... campos básicos
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
      // ... lógica similar
    }
  }
})
```

API del `ctx` (idéntica para online y offline):
- `ctx.insert(tabla, data)` → devuelve fila materializada con `id`
- `ctx.update(tabla, id, cambios)`
- `ctx.get(tabla, id)` → fila o null
- `ctx.queryAll(tabla)` → array de filas

---

## 6. Caso especial: customActions (endpoints REST adicionales)

Si necesitas un endpoint custom (ej. `PATCH /api/usuarios/:id/pin` para resetear PIN), declaras `customActions` en la entity y registras el handler en los overrides online.

**En la entity:**

```js
export const usuario = createEntity({
  // ...
  customActions: {
    resetPin: { path: id => `${id}/pin` }
  }
})
```

**En el server** (`server/utils/onlineOverrides.js`):

```js
usuario: {
  // ...
  customActionHandlers: {
    resetPin: async ({ id, body, db, schema }) => {
      // tu lógica
    }
  }
}
```

La factory online registra el endpoint automáticamente en el path resuelto.

---

## 7. Caso especial: particularidades offline-only

Si el módulo offline necesita lógica especial (rol requerido, hash de PIN, etc.) que NO aplica al server online, declaras overrides en `app/server-offline/index.js` dentro de `OVERRIDES_POR_KEY`:

```js
const OVERRIDES_POR_KEY = {
  miEntidad: {
    requireRole: 'jefe',                          // guardia de rol
    beforeCreate: async (datos) => { ... },       // transforma payload
    beforeUpdate: async (cambios) => { ... },
    serialize: (row) => { ... },                  // oculta campos
    listFilter: (opts, row) => !opts.x || row.x === opts.x,
    actions: {                                    // acciones custom offline
      accionCustom: async (args) => { ... }
    }
  }
}
```

---

## 8. Caso especial: particularidades online-only

Si el server online necesita lógica especial (requireRole, beforeCreate con hash, listFilter con JOIN, etc.) que NO aplica offline, declaras overrides en `server/utils/onlineOverrides.js`:

```js
export const OVERRIDES_ONLINE_POR_KEY = {
  miEntidad: {
    requireRole: 'jefe',
    beforeCreate: async (payload) => { ... },
    listFilter: ({ query, table }) => filterIfPresent(query.x, table.x),
    customActionHandlers: { ... },
    omit: ['put', 'remove']    // no generar estos endpoints estándar
  }
}
```

---

## 9. Anatomía completa de archivos (qué hace cada uno)

| Archivo | Quién lo lee | Qué hace |
|---|---|---|
| `shared/entities/_factory.js` | createEntity (interno) | Genera el objeto entity a partir de la def. |
| `shared/entities/_zod.js` | createEntity | Convierte `fields` en schemas zod (create + update). |
| `shared/entities/<nombre>.js` | TODOS | Definición de la entity. |
| `shared/entities/index.js` | TODOS | Barrel: importa, exporta y lista en `ALL_ENTITIES`. |
| `app/server-offline/index.js` | server-offline (al arranque) | Genera `MODULOS_POR_TABLA` para cada entity. |
| `app/server-offline/api/_factory.js` | server-offline | `createOfflineModule(entity, overrides)`. |
| `app/composables/useLocalRepo.js` | cliente offline | `useLocalRepo(entity)` → CRUD sobre SQLite. |
| `app/composables/useRemoteRepo.js` | cliente online | `useRemoteRepo(entity)` → CRUD sobre REST. |
| `app/composables/useRepo.js` | cliente | `useRepo(entity)` dispatcha online/offline según conexión. |
| `app/composables/useEntityTable.js` | page | Deriva form/columns/initial values desde la entity. |
| `app/composables/useEntityForm.js` | form | Genera fields del form desde `entity.fields`. |
| `app/components/base/Table.vue` | page | Tabla genérica que consume la entity. |
| `app/components/base/EntityForm.vue` | form | Form genérico con validación zod. |
| `server/utils/entityHandlers.js` | server (al arrancar) | `createEntityHandlers(entity, opts)` → handlers h3. |
| `server/utils/pgContext.js` | server | Capa Drizzle agnóstica de tabla (para customMutations online). |
| `server/utils/onlineOverrides.js` | server | Overrides online-only por entity. |
| `server/middleware/05.entity-factory.ts` | server (en cada request) | Dispatcha rutas del factory. |

---

## 10. Checklist de "lo mínimo para que funcione"

Para una **entity simple** (CRUD básico sin lógica especial):

- [ ] Crear tabla en `server/database/schema.ts` + migración.
- [ ] Crear tabla en `app/server-offline/db/schema.ts` + migración.
- [ ] Crear `shared/entities/miEntidad.js` con `fields` y `columns`.
- [ ] Agregar al barrel `shared/entities/index.js`.
- [ ] (Opcional) Crear `app/pages/mi-entidad.vue` para la UI.

Para una **entity con UI custom** (slots, columnas especiales, etc.):

- [ ] Lo anterior.
- [ ] Slots `#<key>-cell` o `#row-actions-extra` en `app/pages/mi-entidad.vue`.

Para una **entity con lógica multi-tabla** (ej. historial de precios):

- [ ] Lo anterior.
- [ ] `customMutations.create/update` en la entity.

Para una **entity con endpoint custom** (ej. reset PIN):

- [ ] Lo anterior.
- [ ] `customActions` en la entity.
- [ ] `customActionHandlers` en `server/utils/onlineOverrides.js`.

---

## 11. Errores comunes

| Error | Causa | Solución |
|---|---|---|
| `Cannot find module '~~/shared/entities'` | El barrel no exporta la entity. | Agrégala al barrel. |
| `no se ven los datos en la página` | `form` y `tableRef` no se pasan correctamente. | Revisa la page de ejemplo (`app/pages/clientes.vue`). |
| `Error 404 en /api/mi_entidad` | La tabla no existe en Postgres o el server no se reinició. | Verifica schema + reinicia. |
| `Error "no such column: actualizadoEn"` offline | La tabla SQLite no tiene esa columna. | Usa `pruneToColumns` (ya lo hace el factory) o agrega la columna. |
| `Error TS2307: Cannot find module 'shared/schemas'` | Estás importando de un archivo que se eliminó en Fase 1. | Usa `entity.schema` y `entity.updateSchema`. |
| `Error: no se puede usar useRepo con string` | Estás llamando `useRepo('mi_entidad')`. | Usa `useRepo(miEntidad)`. |

---

## 12. Resumen ejecutivo

**Para añadir una entity nueva solo necesitas tocar 2 archivos** (`shared/entities/<nombre>.js` + `shared/entities/index.js`), más la tabla física en el schema de cada backend y, opcionalmente, la página en `app/pages/`.

Todo lo demás — endpoints REST, módulo offline, sync, tabla, form, validaciones, paginación, filtros, toggle de activo — se autogenera a partir de la entity.