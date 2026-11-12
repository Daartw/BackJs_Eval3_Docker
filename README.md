# User Service — Backend Node.js

[![CI](https://github.com/Daartw/BackJs_Eval3_Docker/actions/workflows/ci.yml/badge.svg)](https://github.com/Daartw/BackJs_Eval3_Docker/actions/workflows/ci.yml)

API REST de gestión de usuarios construida con **Node.js, Express y MySQL**, empaquetada con Docker.
Es uno de los tres servicios de una aplicación full stack dockerizada:

| Servicio | Repositorio | Puerto |
|---|---|---|
| Usuarios (este) | `BackJs_Eval3_Docker` | 8081 |
| Productos | [BackPy_Eval3_Docker](https://github.com/Daartw/BackPy_Eval3_Docker) | 8082 |
| Frontend | [Front_Eval3_Docker](https://github.com/Daartw/Front_Eval3_Docker) | 80 |

## Características

- Registro de usuarios con validación de entrada.
- Contraseñas almacenadas con hash **scrypt** y sal (nunca en texto plano ni en las respuestas).
- Rutas administrativas protegidas con API key.
- Límite de peticiones por IP, cabeceras de seguridad y CORS configurable.
- Imagen Docker sin root, con *healthcheck*.
- Pruebas automatizadas y auditoría de dependencias en CI.

## Requisitos

- Node.js 20 o superior
- MySQL 8.0 o superior

## Configuración

```bash
cp .env.example .env
```

| Variable | Descripción |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Conexión a MySQL |
| `PORT` | Puerto del servicio (por defecto 8081) |
| `NODE_ENV` | `production` exige definir `CORS_ORIGINS` |
| `CORS_ORIGINS` | Orígenes del frontend autorizados, separados por coma |
| `ADMIN_API_KEY` | Clave de las rutas administrativas (cabecera `X-API-Key`) |
| `SEED_ADMIN_PASSWORD` | Opcional: crea el usuario `admin` inicial con esa contraseña |
| `REGISTER_RATE_LIMIT`, `API_RATE_LIMIT` | Opcional: límites de peticiones por IP |
| `TRUST_PROXY` | Opcional: proxies inversos de confianza delante del servicio |

Crea la base de datos y un usuario propio para el servicio (evita usar `root`):

```sql
CREATE DATABASE users_db;
CREATE USER 'users_app'@'%' IDENTIFIED BY 'una_clave_segura';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE ON users_db.* TO 'users_app'@'%';
```

## Ejecutar

```bash
npm ci
npm start        # producción
npm run dev      # desarrollo con recarga automática
npm test         # pruebas
```

Con Docker:

```bash
docker build -t backjs_eval3 .
docker run --rm -p 8081:8081 --env-file .env backjs_eval3
```

## Endpoints

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/health` | Público | Estado del servicio y de la base de datos |
| POST | `/api/users/register` | Público (con límite) | Registrar un usuario |
| GET | `/api/users` | `X-API-Key` | Listar usuarios |
| GET | `/api/users/{id}` | `X-API-Key` | Obtener un usuario por id |
| GET | `/api/users/username/{username}` | `X-API-Key` | Obtener un usuario por nombre |
| DELETE | `/api/users/{id}` | `X-API-Key` | Eliminar un usuario |

Registrar un usuario (contraseña de 8 a 128 caracteres):

```bash
curl -X POST http://localhost:8081/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"username":"juan","email":"juan@example.com","password":"una-clave-larga"}'
```

Listar usuarios:

```bash
curl http://localhost:8081/api/users -H "X-API-Key: $ADMIN_API_KEY"
```

## Seguridad

Ver [SECURITY.md](SECURITY.md) para las medidas implementadas y cómo reportar una vulnerabilidad.
Al arrancar, el servicio convierte a hash cualquier contraseña antigua guardada en texto plano.

## Autor

Daniel Araya Rebolledo — [@Daartw](https://github.com/Daartw)
