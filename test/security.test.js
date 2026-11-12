'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    hashPassword,
    verifyPassword,
    isPasswordHash,
    validateRegistration,
    parseId,
    requireApiKey,
    createRateLimiter,
    parseOrigins,
} = require('../src/security');

function fakeRes() {
    return {
        statusCode: 200,
        headers: {},
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        set(name, value) { this.headers[name] = value; return this; },
    };
}

test('la contraseña se guarda como hash con sal y nunca en texto plano', async () => {
    const hash = await hashPassword('correcta-caballo-bateria');
    assert.ok(isPasswordHash(hash));
    assert.ok(!hash.includes('correcta-caballo-bateria'));
    assert.notEqual(hash, await hashPassword('correcta-caballo-bateria'));
});

test('verifyPassword acepta la contraseña correcta y rechaza el resto', async () => {
    const hash = await hashPassword('correcta-caballo-bateria');
    assert.equal(await verifyPassword('correcta-caballo-bateria', hash), true);
    assert.equal(await verifyPassword('incorrecta', hash), false);
    assert.equal(await verifyPassword('admin123', 'admin123'), false);
    assert.equal(await verifyPassword({ length: 99 }, hash), false);
});

test('validateRegistration normaliza los datos válidos', () => {
    const { value, error } = validateRegistration({
        username: ' juan.perez ', email: ' Juan@Example.com ', password: 'clave-segura',
    });
    assert.equal(error, undefined);
    assert.deepEqual(value, { username: 'juan.perez', email: 'juan@example.com', password: 'clave-segura' });
});

test('validateRegistration rechaza tipos y formatos inválidos', () => {
    const ok = { username: 'juan', email: 'juan@example.com', password: 'clave-segura' };
    assert.ok(validateRegistration(undefined).error);
    assert.ok(validateRegistration({ ...ok, password: { length: 10 } }).error);
    assert.ok(validateRegistration({ ...ok, username: ['juan'] }).error);
    assert.ok(validateRegistration({ ...ok, username: 'a' }).error);
    assert.ok(validateRegistration({ ...ok, username: '<script>' }).error);
    assert.ok(validateRegistration({ ...ok, email: 'sin-arroba' }).error);
    assert.ok(validateRegistration({ ...ok, password: 'corta' }).error);
    assert.ok(validateRegistration({ ...ok, password: 'x'.repeat(129) }).error);
});

test('parseId solo acepta enteros positivos', () => {
    assert.equal(parseId('42'), 42);
    assert.equal(parseId('0'), null);
    assert.equal(parseId('-1'), null);
    assert.equal(parseId('1 OR 1=1'), null);
    assert.equal(parseId('1e3'), null);
});

test('requireApiKey protege las rutas administrativas', () => {
    const run = (key, header) => {
        const res = fakeRes();
        let passed = false;
        requireApiKey(key)({ get: () => header }, res, () => { passed = true; });
        return { passed, status: res.statusCode };
    };
    assert.deepEqual(run('secreta', 'secreta'), { passed: true, status: 200 });
    assert.deepEqual(run('secreta', 'otra'), { passed: false, status: 401 });
    assert.deepEqual(run('secreta', undefined), { passed: false, status: 401 });
    // sin clave configurada la ruta queda cerrada, no abierta
    assert.deepEqual(run(undefined, 'cualquiera'), { passed: false, status: 503 });
});

test('createRateLimiter bloquea al superar el máximo y se reinicia con la ventana', () => {
    let now = 1000;
    const limiter = createRateLimiter({ windowMs: 1000, max: 2, now: () => now });
    const hit = (ip) => {
        const res = fakeRes();
        let passed = false;
        limiter({ ip }, res, () => { passed = true; });
        return passed ? 200 : res.statusCode;
    };
    assert.equal(hit('1.1.1.1'), 200);
    assert.equal(hit('1.1.1.1'), 200);
    assert.equal(hit('1.1.1.1'), 429);
    assert.equal(hit('2.2.2.2'), 200);
    now += 1001;
    assert.equal(hit('1.1.1.1'), 200);
    limiter.prune();
    assert.equal(limiter.size(), 1);
});

test('parseOrigins separa la lista de orígenes', () => {
    assert.deepEqual(parseOrigins(' http://a.cl , http://b.cl ,'), ['http://a.cl', 'http://b.cl']);
    assert.deepEqual(parseOrigins(undefined), []);
});
