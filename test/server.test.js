'use strict';

// Pruebas de integración de la app Express sin base de datos: comprueban que la
// autenticación y la validación actúan antes de llegar a MySQL.
process.env.ADMIN_API_KEY = 'clave-de-prueba';
process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../server');

let server;
let base;

before(() => new Promise((resolve) => {
    server = http.createServer(app).listen(0, '127.0.0.1', () => {
        base = `http://127.0.0.1:${server.address().port}`;
        resolve();
    });
}));

after(() => new Promise((resolve) => server.close(resolve)));

const admin = { 'X-API-Key': 'clave-de-prueba' };
const register = (body) => fetch(`${base}/api/users/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('las rutas administrativas exigen una API key válida', async () => {
    const routes = [
        ['GET', '/api/users'],
        ['GET', '/api/users/1'],
        ['GET', '/api/users/username/admin'],
        ['DELETE', '/api/users/1'],
    ];
    for (const [method, path] of routes) {
        assert.equal((await fetch(base + path, { method })).status, 401, `${method} ${path} sin clave`);
        const wrong = await fetch(base + path, { method, headers: { 'X-API-Key': 'incorrecta' } });
        assert.equal(wrong.status, 401, `${method} ${path} con clave incorrecta`);
    }
});

test('los ids inválidos se rechazan antes de consultar la base de datos', async () => {
    assert.equal((await fetch(`${base}/api/users/1%20OR%201=1`, { headers: admin })).status, 400);
    assert.equal((await fetch(`${base}/api/users/abc`, { method: 'DELETE', headers: admin })).status, 400);
});

test('el registro rechaza entradas inválidas', async () => {
    const valid = { username: 'juan', email: 'juan@example.com', password: 'clave-segura' };
    assert.equal((await register({ ...valid, password: 'corta' })).status, 400);
    assert.equal((await register({ ...valid, password: { length: 99 } })).status, 400);
    assert.equal((await register({ ...valid, email: 'sin-arroba' })).status, 400);
    assert.equal((await register('{json roto')).status, 400);
    assert.equal((await register({ ...valid, username: 'x'.repeat(20000) })).status, 413);
});

test('los errores internos no entregan detalles al cliente', async () => {
    // sin base de datos conectada la consulta falla: el cliente solo ve un mensaje genérico
    const res = await fetch(`${base}/api/users`, { headers: admin });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: 'Error interno del servidor' });
});

test('respuestas con cabeceras de seguridad y 404 en JSON', async () => {
    const res = await fetch(`${base}/no-existe`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'Ruta no encontrada' });
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-powered-by'), null);
});
