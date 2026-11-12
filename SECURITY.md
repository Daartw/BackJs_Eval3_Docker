# Política de seguridad

## Reportar una vulnerabilidad

Si encuentras un problema de seguridad, **no abras un issue público**. Usa
**Security → Report a vulnerability** en este repositorio o escribe a
**danie.arayar@duocuc.cl** con:

- Descripción del problema y su impacto.
- Pasos para reproducirlo.
- Versión o commit afectado.

Responderé dentro de 7 días.

## Medidas implementadas

- Contraseñas almacenadas con **scrypt** y sal aleatoria; nunca se devuelven en las respuestas.
- Consultas SQL parametrizadas y validación de tipos, formato y largo en la entrada.
- Rutas administrativas protegidas con `X-API-Key` (cerradas si no hay clave configurada).
- Límite de peticiones por IP, cabeceras de seguridad y CORS restringido en producción.
- Contenedor sin privilegios de root, `npm ci` reproducible y `npm audit` en CI.

## Al desplegar

- Define `ADMIN_API_KEY`, `CORS_ORIGINS` y las credenciales de MySQL como variables de entorno; nunca las subas al repositorio.
- Usa un usuario de MySQL propio del servicio, sin privilegios de administrador (no `root`).
- Publica el servicio detrás de HTTPS (proxy inverso) y define `TRUST_PROXY`.
