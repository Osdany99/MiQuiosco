export function useDatosVersion() {
  const version = useState('datos:version', () => 0)

  function notificarCambioDatos() {
    version.value += 1
  }

  return { version, notificarCambioDatos }
}
