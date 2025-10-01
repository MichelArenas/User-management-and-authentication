// test/SpecialtiesController.routes.test.js
const request = require('supertest');
const express = require('express');

// ---- mockPrisma definido antes de jest.mock ----
const mockPrisma = {
  departments: {
    findUnique: jest.fn()
  },
  specialties: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  }
};

// Mockear Prisma para que el controller use mockPrisma
jest.mock('../src/generated/prisma', () => {
  return { PrismaClient: jest.fn(() => mockPrisma) };
});

// Middlewares no-op para simular verifyJWT y permission usados en las rutas reales
const verifyJWT = (req, _res, next) => {
  // opcionalmente inyecta user si tu controller lo usa
  req.user = { id: 'test-user', role: 'ADMINISTRADOR', email: 'a@b.com' };
  next();
};
const permission = (_perm) => (req, _res, next) => next();

// Importar controller AFTER mockear Prisma
const specialtiesController = require('../src/controllers/specialityController');

// Configurar app con las rutas EXACTAS que tienes
const app = express();
app.use(express.json());
app.post('/api/v1/specialties', verifyJWT, permission('specialty:create'), specialtiesController.createSpecialty);
app.get('/api/v1/specialties', verifyJWT, permission('specialty:list'), specialtiesController.listSpecialties);
app.get('/api/v1/specialties/department/:departmentId', verifyJWT, permission('specialty:list'), specialtiesController.listByDepartment);

describe('Rutas /api/v1/specialties (matching project routes)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Crear especialidad correctamente (201)', async () => {
    // dept existe
    mockPrisma.departments.findUnique.mockResolvedValue({ id: 'd1', name: 'DEPT1' });
    // name no existe
    mockPrisma.specialties.findUnique.mockResolvedValue(null);
    // create devuelve la especialidad
    mockPrisma.specialties.create.mockResolvedValue({ id: 's1', name: 'NEURO', departmentId: 'd1' });

    const res = await request(app)
      .post('/api/v1/specialties')
      .send({ name: 'NEURO', departmentId: 'd1', description: 'desc' });

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Especialidad creada');
    expect(res.body.specialty).toEqual(expect.objectContaining({ id: 's1', name: 'NEURO' }));
  });

  test('Rechazar si falta name o departmentId (400)', async () => {
    const res = await request(app).post('/api/v1/specialties').send({ name: 'SIN_DEPT' });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/name y departmentId son obligatorios/i);
  });

  test('Rechazar si departamento no existe (404)', async () => {
    mockPrisma.departments.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/specialties')
      .send({ name: 'NEURO', departmentId: 'missing' });

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toMatch(/departamento no encontrado/i);
  });

  test('Rechazar si especialidad ya existe (409)', async () => {
    mockPrisma.departments.findUnique.mockResolvedValue({ id: 'd1' });
    mockPrisma.specialties.findUnique.mockResolvedValue({ id: 's-exist', name: 'NEURO' });

    const res = await request(app)
      .post('/api/v1/specialties')
      .send({ name: 'NEURO', departmentId: 'd1' });

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/ya existe/i);
  });

  test('Listar todas las especialidades (GET /) devuelve 200', async () => {
    mockPrisma.specialties.findMany.mockResolvedValue([
      { id: 's1', name: 'DERMA', department: { id: 'd1', name: 'DERM' } }
    ]);

    const res = await request(app).get('/api/v1/specialties');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toEqual(expect.objectContaining({ name: 'DERMA' }));
  });

  test('Listar por departamento válido (GET /department/:departmentId) 200', async () => {
    mockPrisma.departments.findUnique.mockResolvedValue({ id: 'd1', name: 'D1' });
    mockPrisma.specialties.findMany.mockResolvedValue([{ id: 's1', name: 'TRAUMA', departmentId: 'd1' }]);

    const res = await request(app).get('/api/v1/specialties/department/d1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'TRAUMA' })]));
  });

  test('Listar por departamento inexistente devuelve 404', async () => {
    mockPrisma.departments.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/v1/specialties/department/nope');
    expect(res.statusCode).toBe(404);
    expect(res.body.message).toMatch(/departamento no encontrado/i);
  });

  test('Crear especialidad -> error BD devuelve 500', async () => {
    mockPrisma.departments.findUnique.mockRejectedValue(new Error('DB fail'));

    const res = await request(app)
      .post('/api/v1/specialties')
      .send({ name: 'X', departmentId: 'd1' });

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toMatch(/error creando especialidad|error en el servidor/i);
  });

  test('Listar especialidades -> error BD devuelve 500', async () => {
    mockPrisma.specialties.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/v1/specialties');
    expect(res.statusCode).toBe(500);
    expect(res.body.message).toMatch(/error listando especialidades|error en el servidor/i);
  });
});
