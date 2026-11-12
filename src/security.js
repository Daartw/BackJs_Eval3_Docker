'use strict';

/**
 * Utilidades de seguridad del servicio de usuarios.
 * Solo usan módulos nativos de Node.js (sin dependencias externas).
 */
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

// Parámetros de scrypt (recomendación OWASP: N >= 2^15 con r=8, p=1).
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };
const HASH_PREFIX = 'scrypt';

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128; // evita que una contraseña gigante consuma CPU en el hash
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,50}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Devuelve "scrypt$N$r$p$salt$hash" (salt y hash en base64). */
async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const { N, r, p, keylen, maxmem } = SCRYPT;
    const hash = await scrypt(password, salt, keylen, { N, r, p, maxmem });
    return [HASH_PREFIX, N, r, p, salt.toString('base64'), hash.toString('base64')].join('$');
}

/** Compara una contraseña con un hash generado por hashPassword (en tiempo constante). */
async function verifyPassword(password, stored) {
    if (typeof password !== 'string' || !isPasswordHash(stored)) return false;
    const [, N, r, p, saltB64, hashB64] = stored.split('$');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
        N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
    });
    return crypto.timingSafeEqual(actual, expected);
}

function isPasswordHash(value) {
    return typeof value === 'string' && value.startsWith(`${HASH_PREFIX}$`) && value.split('$').length === 6;
}

/**
 * Valida el cuerpo del registro. Devuelve { value } con los datos normalizados
 * o { error } con un mensaje para el cliente.
 */
function validateRegistration(body) {
    const { username, email, password } = body || {};
    if (typeof username !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
        return { error: 'Todos los campos son requeridos' };
    }
    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!USERNAME_RE.test(cleanUsername)) {
        return { error: 'El usuario debe tener entre 3 y 50 caracteres (letras, números, punto, guion o guion bajo)' };
    }
    if (cleanEmail.length > 100 || !EMAIL_RE.test(cleanEmail)) {
        return { error: 'El email no es válido' };
    }
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
        return { error: `La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres` };
    }
    return { value: { username: cleanUsername, email: cleanEmail, password } };
}

/** Convierte un parámetro de ruta en un id entero positivo, o null si no es válido. */
function parseId(raw) {
    if (!/^\d{1,10}$/.test(String(raw))) return null;
    const id = Number(raw);
    return id > 0 ? id : null;
}

function safeEqual(a, b) {
    const ha = crypto.createHash('sha256').update(String(a)).digest();
    const hb = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

/**
 * Middleware: exige la cabecera X-API-Key para las rutas administrativas.
 * Si no hay clave configurada, la ruta queda deshabilitada (seguro por defecto).
 */
function requireApiKey(expectedKey) {
    return (req, res, next) => {
        if (!expectedKey) {
            return res.status(503).json({ error: 'Ruta administrativa deshabilitada: define ADMIN_API_KEY' });
        }
        const provided = req.get('x-api-key');
        if (!provided || !safeEqual(provided, expectedKey)) {
            return res.status(401).json({ error: 'API key inválida o ausente' });
        }
        next();
    };
}

/** Limitador de peticiones en memoria por IP (ventana fija). */
function createRateLimiter({ windowMs, max, now = Date.now }) {
    const hits = new Map();
    const prune = () => {
        const t = now();
        for (const [key, entry] of hits) if (t >= entry.resetAt) hits.delete(key);
    };
    const middleware = (req, res, next) => {
        const t = now();
        if (hits.size > 10000) prune(); // acota la memoria ante muchas IP distintas
        const key = req.ip || 'desconocida';
        let entry = hits.get(key);
        if (!entry || t >= entry.resetAt) {
            entry = { count: 0, resetAt: t + windowMs };
            hits.set(key, entry);
        }
        entry.count += 1;
        if (entry.count > max) {
            res.set('Retry-After', String(Math.ceil((entry.resetAt - t) / 1000)));
            return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta nuevamente más tarde.' });
        }
        next();
    };
    middleware.prune = prune;
    middleware.size = () => hits.size;
    return middleware;
}

/** Cabeceras de seguridad básicas para una API JSON. */
function securityHeaders(req, res, next) {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
        'Cross-Origin-Resource-Policy': 'same-site',
        'Cache-Control': 'no-store',
    });
    next();
}

/** Lista de orígenes CORS a partir de una variable separada por comas. */
function parseOrigins(raw) {
    return String(raw || '').split(',').map((o) => o.trim()).filter(Boolean);
}

module.exports = {
    PASSWORD_MIN,
    hashPassword,
    verifyPassword,
    isPasswordHash,
    validateRegistration,
    parseId,
    requireApiKey,
    createRateLimiter,
    securityHeaders,
    parseOrigins,
};
