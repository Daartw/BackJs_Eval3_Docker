'use strict';

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const {
    hashPassword,
    isPasswordHash,
    validateRegistration,
    parseId,
    requireApiKey,
    createRateLimiter,
    securityHeaders,
    parseOrigins,
} = require('./src/security');

const app = express();
const port = Number(process.env.PORT) || 8081;
const isProduction = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
// Detrás de un proxy inverso (Nginx, ALB...) indica cuántos saltos son de confianza
// para que req.ip sea la IP real del cliente. Sin proxy, deja el valor por defecto.
if (process.env.TRUST_PROXY) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
}

// --- CORS -------------------------------------------------------------------
// En producción solo se aceptan los orígenes listados en CORS_ORIGINS.
// En desarrollo, si no se define, se permite cualquier origen.
const allowedOrigins = parseOrigins(process.env.CORS_ORIGINS);
if (isProduction && allowedOrigins.length === 0) {
    console.warn('CORS_ORIGINS no está definido: el navegador bloqueará las peticiones desde otros orígenes.');
}
const corsOptions = {
    origin: allowedOrigins.includes('*') || (!isProduction && allowedOrigins.length === 0) ? '*' : allowedOrigins,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-API-Key'],
    maxAge: 600,
};

// --- Middleware -------------------------------------------------------------
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));

const adminOnly = requireApiKey(process.env.ADMIN_API_KEY);
const registerLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.REGISTER_RATE_LIMIT) || 10,
});
const apiLimiter = createRateLimiter({ windowMs: 60 * 1000, max: Number(process.env.API_RATE_LIMIT) || 120 });
app.use('/api', apiLimiter);

// --- Base de datos ----------------------------------------------------------
let db;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectWithRetry(attempts = 10) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const pool = mysql.createPool({
                host: process.env.DB_HOST,
                port: Number(process.env.DB_PORT) || 3306,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
                waitForConnections: true,
                connectionLimit: 10,
            });
            await pool.query('SELECT 1');
            return pool;
        } catch (error) {
            console.error(`MySQL no disponible (intento ${attempt}/${attempts}): ${error.code || error.message}`);
            if (attempt === attempts) throw error;
            await sleep(3000);
        }
    }
    throw new Error('No se pudo conectar a MySQL');
}

/** Reemplaza por su hash cualquier contraseña que haya quedado guardada en texto plano. */
async function migratePlaintextPasswords() {
    const [rows] = await db.execute("SELECT id, password FROM users WHERE password NOT LIKE 'scrypt$%'");
    for (const row of rows) {
        if (isPasswordHash(row.password)) continue;
        await db.execute('UPDATE users SET password = ? WHERE id = ?', [await hashPassword(row.password), row.id]);
    }
    if (rows.length > 0) console.log(`Contraseñas migradas a hash: ${rows.length}`);
}

async function seedAdmin() {
    // El usuario inicial solo se crea si se entrega su contraseña por variable de entorno.
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password) return;
    const [rows] = await db.execute('SELECT COUNT(*) AS count FROM users');
    if (rows[0].count > 0) return;
    await db.execute(
        'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
        ['admin', process.env.SEED_ADMIN_EMAIL || 'admin@example.com', await hashPassword(password)]
    );
    console.log('Usuario inicial "admin" creado');
}

async function initDB() {
    db = await connectWithRetry();
    console.log('Connected to MySQL database');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    console.log('Users table ready');

    await migratePlaintextPasswords();
    await seedAdmin();
}

// Envuelve un handler async para que sus errores lleguen al manejador central.
const route = (handler) => (req, res, next) => handler(req, res, next).catch(next);

const PUBLIC_FIELDS = 'id, username, email, created_at';

// --- Rutas ------------------------------------------------------------------
app.get('/health', route(async (req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
}));

app.post('/api/users/register', registerLimiter, route(async (req, res) => {
    const { value, error } = validateRegistration(req.body);
    if (error) {
        return res.status(400).json({ error });
    }

    const [existingUser] = await db.execute(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [value.username, value.email]
    );
    if (existingUser.length > 0) {
        return res.status(400).json({ error: 'El usuario o email ya existe' });
    }

    let result;
    try {
        [result] = await db.execute(
            'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
            [value.username, value.email, await hashPassword(value.password)]
        );
    } catch (dbError) {
        // dos registros simultáneos con el mismo usuario o email
        if (dbError.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'El usuario o email ya existe' });
        }
        throw dbError;
    }

    const [newUser] = await db.execute(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`, [result.insertId]);
    res.status(201).json(newUser[0]);
}));

app.get('/api/users', adminOnly, route(async (req, res) => {
    const [users] = await db.execute(`SELECT ${PUBLIC_FIELDS} FROM users`);
    res.json(users);
}));

app.get('/api/users/username/:username', adminOnly, route(async (req, res) => {
    const [users] = await db.execute(
        `SELECT ${PUBLIC_FIELDS} FROM users WHERE username = ?`,
        [String(req.params.username).slice(0, 50)]
    );
    if (users.length === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(users[0]);
}));

app.get('/api/users/:id', adminOnly, route(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: 'Id inválido' });
    }
    const [users] = await db.execute(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`, [id]);
    if (users.length === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json(users[0]);
}));

app.delete('/api/users/:id', adminOnly, route(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
        return res.status(400).json({ error: 'Id inválido' });
    }
    const [result] = await db.execute('DELETE FROM users WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.status(204).send();
}));

// --- Errores ----------------------------------------------------------------
app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'JSON inválido' });
    }
    if (error.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Solicitud demasiado grande' });
    }
    // El detalle queda en el log del servidor; al cliente no se le entrega información interna.
    console.error(`${req.method} ${req.path}:`, error.code || error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// --- Arranque ---------------------------------------------------------------
if (require.main === module) {
    initDB()
        .then(() => {
            const server = app.listen(port, () => {
                console.log(`Backend 1 (User Service) running on port ${port}`);
            });
            const shutdown = () => server.close(() => db.end().finally(() => process.exit(0)));
            process.on('SIGTERM', shutdown);
            process.on('SIGINT', shutdown);
        })
        .catch((error) => {
            console.error('Database connection error:', error.code || error.message);
            process.exit(1);
        });
}

module.exports = app;
