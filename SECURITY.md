# Security Policy

## Cómo reportar una vulnerabilidad

**No abras incidencias públicas** para reportar un fallo de seguridad. Este
repositorio tiene Issues desactivados a propósito y, aunque los habilitaras,
un informe público expone el fallo antes de que se corrija.

Usa **"Report a vulnerability"** (pestaña *Security* de este repositorio en
GitHub). Es privado: solo lo ven tú y el mantenedor, y abre un hilo
confidencial para discutir el arreglo.

Incluye, si puedes:
- Qué se ve afectado (web, API, APK, sincronización offline…).
- Pasos para reproducirlo.
- Impacto (qué datos o acciones expone).

Reacciono en 7 días. Si el fallo compromete datos de ventas o credenciales,
priorizo el arreglo sobre cualquier otra cosa.

## Qué consideré fuera de alcance

- Vulnerabilidades en dependencias sin cadena de exploits practicable contra
  esta app.
- Problemas que solo afecten a un dispositivo con root o a un entorno ya
  comprometido por quien lo controla.
- Falta deTTPS o de validación en peticiones que no contienen datos sensibles.
