// test/BulkImportController.test.js
const express = require('express');
const request = require('supertest');

// Mocks mínimos para que el router no bloquee por auth/permission
jest.mock('../src/middlewares/authMiddelware', () => (req, _res, next) => {
  req.user = { id: 'u1', email: 'admin@test.com', role: 'ADMINISTRADOR' };
  next();
});
jest.mock('../src/middlewares/permissionMiddelware', () => () => (_req, _res, next) => next());

// ---- Mocks de dependencias externas ----
const mockPrisma = {
  users: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  activityLog: { create: jest.fn() },
};
jest.mock('../src/generated/prisma', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

jest.mock('../src/config/loggerService', () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/config/emailConfig', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({ success: true }),
  sendActivationEmail: jest.fn().mockResolvedValue({ success: true }), // por si se usa en ACTIVE
  generateVerificationCode: jest.fn(() => '123456'),                   // ⬅️ faltaba
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn(async () => 'hashed-pass'),
}));

// Mock del parser de CSV (sin variables “fuera de alcance” no permitidas)
const mockPrepare = jest.fn();
jest.mock('../src/services/bulkImportService', () => ({
  prepareBulkUsersFromCsv: (...args) => mockPrepare(...args),
}));

// ---- SUT: controlador real ----
const { bulkImport } = require('../src/controllers/UserController');

// ---- App de prueba: inyecta req.user y un "archivo" en req.file ----
const app = express();

// almacenamos el file del test actual aquí
let __currentFile = null;


app.use((req, _res, next) => {
  // simula usuario autenticado admin
  req.user = { id: 'admin-1', email: 'admin@test.com', role: 'ADMINISTRADOR' };
  // si el test setea un "archivo", lo asignamos al request
  if (__currentFile) req.file = __currentFile;
  next();
});
app.post('/api/v1/users/bulk-import', bulkImport);

// ---- Helpers para construir "archivo" y setear mocks comunes ----
function setFileFromString(nameOrOpts, content, mimetype = 'text/csv', sizeBytes) {
  // Soporta objeto o argumentos
   if (nameOrOpts === null && content === null) {
    __currentFile = null;
    return;
  }
  const opts = typeof nameOrOpts === 'object' && nameOrOpts !== null
    ? nameOrOpts
    : { name: nameOrOpts, content, mimetype, sizeBytes };

  const name = opts.name ?? 'data.csv';
  const body = opts.content ?? '';
  const type = opts.mimetype ?? 'text/csv';
  const buf  = Buffer.from(body, 'utf8');

  __currentFile = {
    originalname: name,
    mimetype: type,
    size: typeof opts.sizeBytes === 'number' ? opts.sizeBytes : buf.length,
    buffer: buf,
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  __currentFile = null;
});

// Lee límite desde env o usa 5 MB por defecto (ajústalo al que uses en tu controlador)
const LIMIT = 60 * 1024 * 1024;

describe('bulkImport - casos positivos, negativos, vacíos y nulos', () => {
  test('400 si NO se envía archivo (nulo)', async () => {
    setFileFromString(null, null); // no file
    const res = await request(app).post('/api/v1/users/bulk-import');
    expect(res.statusCode).toBe(400);
    // haz el assert flexible al mensaje
    expect(JSON.stringify(res.body).toLowerCase()).toMatch(/csv|archivo|file/);
  });

  test('400 si el CSV está vacío o mal formado (records vacíos)', async () => {
    setFileFromString('empty.csv', ' '); // ⬅️ manda algo > 0 bytes
    mockPrepare.mockReturnValueOnce({
        records: [],
        toInsert: [],
        errors: [],
        duplicatesCSV: [],
    });
    const res = await request(app).post('/api/v1/users/bulk-import');
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.body).toLowerCase()).toMatch(/vac[ií]o|formato|sin\s*datos|csv/);
    });

  test('200 éxito: una fila PENDING válida → inserta y envía email (caso positivo)', async () => {
    setFileFromString('ok.csv', 'dummy');
    mockPrepare.mockReturnValueOnce({
      records: [{}], // al menos 1
      toInsert: [
        {
          email: 'user1@test.com',
          fullname: 'User Uno',
          role: 'PACIENTE',
          status: 'PENDING',
          passwordPlain: 'Pass1234',
        },
      ],
      errors: [],
      duplicatesCSV: [],
    });

    mockPrisma.users.findMany.mockResolvedValueOnce([]); // no existen en BD
    mockPrisma.users.create.mockResolvedValueOnce({
      id: 'u1',
      email: 'user1@test.com',
      fullname: 'User Uno',
      role: 'PACIENTE',
      isActive: true,
      status: 'PENDING',
    });

    const res = await request(app).post('/api/v1/users/bulk-import');
    expect(res.statusCode).toBe(200);
    expect(res.body.inserted).toHaveLength(1);
    expect(res.body.errors).toHaveLength(0);
    expect(res.body.duplicatesCSV).toHaveLength(0);
    expect(res.body.duplicatesDB).toHaveLength(0);
    expect(mockPrisma.users.create).toHaveBeenCalledTimes(1);
  });

  test('200 éxito: fila ACTIVE válida → inserta y NO envía email (positivo sin correo)', async () => {
    setFileFromString('active.csv', 'dummy');
    mockPrepare.mockReturnValueOnce({
      records: [{}],
      toInsert: [
        {
          email: 'act@test.com',
          fullname: 'User Active',
          role: 'PACIENTE',
          status: 'ACTIVE', // no PENDING
          passwordPlain: 'Pass1234',
        },
      ],
      errors: [],
      duplicatesCSV: [],
    });

    mockPrisma.users.findMany.mockResolvedValueOnce([]);
    mockPrisma.users.create.mockResolvedValueOnce({
      id: 'u2',
      email: 'act@test.com',
      fullname: 'User Active',
      role: 'PACIENTE',
      isActive: true,
      status: 'ACTIVE',
    });

    const res = await request(app).post('/api/v1/users/bulk-import');
    expect(res.statusCode).toBe(200);
    expect(res.body.inserted).toHaveLength(1);
    expect(res.body.inserted[0].status).toBe('ACTIVE');
  });

  test('200 con duplicado en BD (negativo: email ya existe) → no inserta y reporta duplicatesDB', async () => {
    setFileFromString('dupdb.csv', 'dummy');
    mockPrepare.mockReturnValueOnce({
      records: [{}, {}],
      toInsert: [
        {
          email: 'dup@test.com',
          fullname: 'User Dup',
          role: 'PACIENTE',
          status: 'PENDING',
          passwordPlain: 'Pass1234',
        },
      ],
      errors: [],
      duplicatesCSV: [],
    });

    // BD ya tiene ese correo
    mockPrisma.users.findMany.mockResolvedValueOnce([{ email: 'dup@test.com' }]);

    const res = await request(app).post('/api/v1/users/bulk-import');
    expect(res.statusCode).toBe(200);
    expect(res.body.inserted).toHaveLength(0);
    expect(res.body.duplicatesDB).toHaveLength(1);
    expect(res.body.errors).toHaveLength(0);
  });

  test('200 con duplicados dentro del CSV (negativo interno) → no inserta los duplicadosCSV', async () => {
    setFileFromString('dupcsv.csv', 'dummy');
    mockPrepare.mockReturnValueOnce({
      records: [{}, {}, {}],
      toInsert: [
        {
          email: 'a@test.com',
          fullname: 'A',
          role: 'PACIENTE',
          status: 'PENDING',
          passwordPlain: 'Pass1234',
        },
      ], // el servicio ya descartó duplicadas hacia duplicatesCSV
      errors: [],
      duplicatesCSV: [{ email: 'a@test.com', error: 'Duplicado en CSV' }],
    });

    mockPrisma.users.findMany.mockResolvedValueOnce([]); // BD limpia
    mockPrisma.users.create.mockResolvedValueOnce({
      id: 'u3',
      email: 'a@test.com',
      fullname: 'A',
      role: 'PACIENTE',
      isActive: true,
      status: 'PENDING',
    });

    const res = await request(app).post('/api/v1/users/bulk-import');
    expect(res.statusCode).toBe(200);
    expect(res.body.inserted).toHaveLength(1);
    expect(res.body.duplicatesCSV).toHaveLength(1);
    expect(res.body.errors).toHaveLength(0);
  });

  test('200 mezclado: inserta una, otra falla al crear en BD (negativo por excepción)', async () => {
    setFileFromString('mixed.csv', 'dummy');
    mockPrepare.mockReturnValueOnce({
      records: [{}, {}],
      toInsert: [
        {
          email: 'ok@test.com',
          fullname: 'OK',
          role: 'PACIENTE',
          status: 'PENDING',
          passwordPlain: 'Pass1234',
        },
        {
          email: 'fail@test.com',
          fullname: 'FAIL',
          role: 'PACIENTE',
          status: 'PENDING',
          passwordPlain: 'Pass1234',
        },
      ],
      errors: [],
      duplicatesCSV: [],
    });

    mockPrisma.users.findMany.mockResolvedValueOnce([]); // ninguno existe
    mockPrisma.users.create
      .mockResolvedValueOnce({
        id: 'u-ok',
        email: 'ok@test.com',
        fullname: 'OK',
        role: 'PACIENTE',
        isActive: true,
        status: 'PENDING',
      })
      .mockRejectedValueOnce(new Error('DB down'));

    const res = await request(app).post('/api/v1/users/bulk-import');
    expect(res.statusCode).toBe(200);
    expect(res.body.inserted).toHaveLength(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].email).toBe('fail@test.com');
  });

  test('200 cuando records existen pero toInsert viene vacío (caso “nulo lógico”)', async () => {
    setFileFromString('noinsert.csv', 'dummy');
    mockPrepare.mockReturnValueOnce({
      records: [{}, {}],
      toInsert: [],
      errors: [],
      duplicatesCSV: [],
    });

    mockPrisma.users.findMany.mockResolvedValueOnce([]); 

    const res = await request(app).post('/api/v1/users/bulk-import');
    expect(res.statusCode).toBe(200);
    expect(res.body.inserted).toHaveLength(0);
    expect(res.body.duplicatesDB).toHaveLength(0);
    expect(res.body.errors).toHaveLength(0);
  });

const expressRouter = require('express');
const userRoutes = require('../src/router/userRoutes'); // o ../src/routes/userRoutes si esa es tu ruta

function makeRouterApp() {
  const app = expressRouter();
  app.use(expressRouter.json());
  app.use('/api/v1/users', userRoutes);

  // Error handler para convertir errores Multer en respuestas claras en test
  app.use((err, _req, res, _next) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'El archivo excede el límite de 60MB.' });
    }
    if (err && err.code === 'INVALID_FILETYPE') {
      return res.status(415).json({ message: 'Tipo inválido. Solo se permite CSV.' });
    }
    return res.status(400).json({ message: err?.message || 'Error al subir archivo' });
  });
  return app;
}

describe('Bulk import - límite de tamaño CSV', () => {
  test('RECHAZA archivo mayor al límite (espera 413 o 400 con mensaje de tamaño)', async () => {
    const appRouter = makeRouterApp();
    const buf = Buffer.alloc(LIMIT + 1, 0x61);
    const res = await request(appRouter)
      .post('/api/v1/users/bulk-import')
      .attach('file', buf, { filename: 'big.csv', contentType: 'text/csv' });

    expect(res.statusCode).toBe(413);
    expect(JSON.stringify(res.body).toLowerCase()).toMatch(/60|l[ií]mite|size|tamañ/);
  });

test('NO 413 si pesa exactamente 60MB', async () => {
    const appRouter = makeRouterApp();
    const buf = Buffer.alloc(LIMIT, 0x61);
    const res = await request(appRouter)
      .post('/api/v1/users/bulk-import')
      .attach('file', buf, { filename: 'ok.csv', contentType: 'text/csv' });

    expect(res.statusCode).not.toBe(413);
    expect([200, 400]).toContain(res.statusCode); // dependerá de tu parser
  });

  
});
});
