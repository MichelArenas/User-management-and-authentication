// test/UsersController.critical.test.js
const request = require('supertest');
const express = require('express');

// Mock de Prisma basado en tu schema
const mockPrisma = {
  users: {
    findUnique: jest.fn(),
  },
  departments: {
    findUnique: jest.fn(),
  },
  specialties: {
    findUnique: jest.fn(),
  },
  userDeptRoles: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  }
};

// Mock del cliente de Prisma
jest.mock('../src/generated/prisma', () => ({
  PrismaClient: jest.fn(() => mockPrisma)
}));

// Importar controller
const { createAffiliation, listAffiliationsByUser } = require('../src/controllers/AffiliationsController');

const app = express();
app.use(express.json());

// Rutas que usarán el controller
app.post('/api/v1/affiliations', createAffiliation);
app.get('/api/v1/affiliations/user/:userId', listAffiliationsByUser);

describe('Pruebas críticas de UserDeptRoles (afiliaciones)', () => {
  beforeEach(() => jest.clearAllMocks());

  /** ---------- VALIDACIONES DE ENTRADA ---------- */
  test('Debe rechazar cuerpo vacío', async () => {
    const res = await request(app).post('/api/v1/affiliations').send({});
    expect(res.statusCode).toBe(400);
  });

  test('Debe rechazar sin userId o role', async () => {
    const res = await request(app).post('/api/v1/affiliations').send({ role: 'PACIENTE' });
    expect(res.statusCode).toBe(400);
  });

  test('Debe rechazar rol inválido', async () => {
    const res = await request(app).post('/api/v1/affiliations').send({ userId: 'u1', role: 'INVALIDO' });
    expect(res.statusCode).toBe(400);
  });

 
  /** ---------- ERRORES DE CONSISTENCIA ---------- */
  test('Debe rechazar si el usuario no existe', async () => {
    mockPrisma.users.findUnique.mockResolvedValue(null);

    const res = await request(app).post('/api/v1/affiliations').send({
      userId: 'uX',
      role: 'PACIENTE',
      departmentId: 'd1'
    });

    expect(res.statusCode).toBe(404);
  });

  test('Debe rechazar si el departamento no existe', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({ id: 'u1' });
    mockPrisma.departments.findUnique.mockResolvedValue(null);

    const res = await request(app).post('/api/v1/affiliations').send({
      userId: 'u1',
      role: 'MEDICO',
      departmentId: 'depX'
    });

    expect(res.statusCode).toBe(404);
  });

 
  /** ---------- ERRORES INTERNOS ---------- */
  test('Debe devolver 500 en error de BD', async () => {
    mockPrisma.users.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await request(app).post('/api/v1/affiliations').send({
      userId: 'u1',
      role: 'PACIENTE',
      departmentId: 'd1'
    });

    expect(res.statusCode).toBe(500);
  });

  /** ---------- LISTADO ---------- */
  test('Debe listar todas las afiliaciones de un usuario', async () => {
    mockPrisma.userDeptRoles.findMany.mockResolvedValue([
      { id: 'a1', userId: 'u1', role: 'PACIENTE', departmentId: 'd1' }
    ]);

    const res = await request(app).get('/api/v1/affiliations/user/u1');
    expect(res.statusCode).toBe(200);
    expect(res.body[0].role).toBe('PACIENTE');
  });
});
