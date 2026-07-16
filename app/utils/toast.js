function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''
}

export function toastMsg(operation, label, opts = {}) {
  const verbos = {
    created: { m: 'creado', f: 'creada' },
    updated: { m: 'actualizado', f: 'actualizada' },
    deleted: { m: 'eliminado', f: 'eliminada' },
    read: { m: 'obtenido', f: 'obtenida' },
    readAll: { m: 'cargados', f: 'cargadas' },
    toggled: { m: opts.activo ? 'activado' : 'desactivado', f: opts.activo ? 'activada' : 'desactivada' }
  }

  const v = verbos[operation]
  if (!v) return 'Operación exitosa'

  const adj = label.gender === 'f' ? v.f : v.m

  if (operation === 'toggled') return `${capitalize(label.singular)} ${adj}`
  if (operation === 'readAll') return `${label.plural} ${adj} correctamente`
  return `${capitalize(label.singular)} ${adj} correctamente`
}
