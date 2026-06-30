# Backend 1 - User Service

Backend en Node.js (JavaScript) para gestión de usuarios con base de datos MySQL.

## Características

- API REST para gestión de usuarios
- Registro de usuarios con validación
- Base de datos MySQL
- Configuración vía archivo .env

## Requisitos

- Node.js 18 o superior
- MySQL 8.0 o superior
- npm

## Configuración

1. Copiar el archivo de ejemplo:
```bash
cp .env.example .env
```

2. Editar `.env` con sus credenciales de MySQL:
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=users_db
PORT=8081
```

3. Crear la base de datos en MySQL:
```sql
CREATE DATABASE users_db;
```

## Instalación

```bash
npm install
```

## Ejecutar

```bash
npm start
```

Para desarrollo con auto-reload:
```bash
npm run dev
```

El servidor iniciará en el puerto 8081.

## Endpoints

- `POST /api/users/register` - Registrar nuevo usuario
- `GET /api/users` - Obtener todos los usuarios
- `GET /api/users/{id}` - Obtener usuario por ID
- `GET /api/users/username/{username}` - Obtener usuario por username
- `DELETE /api/users/{id}` - Eliminar usuario

## Ejemplo de Uso

Registrar usuario:
```bash
curl -X POST http://localhost:8081/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"username":"juan","email":"juan@example.com","password":"123456"}'
```

Obtener usuarios:
```bash
curl http://localhost:8081/api/users
```
