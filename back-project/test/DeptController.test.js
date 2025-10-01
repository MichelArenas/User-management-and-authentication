// test/DepartmentsController.test.js
const request = require('supertest');
const express = require('express');

// Mock de Prisma
const mockPrisma = {
  departments: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn()
  }
};

// Mockear el módulo Prisma
jest.mock('../src/generated/prisma', () => {
  return { PrismaClient: jest.fn(() => mockPrisma) };
});


// Importar controlador
const departmentsController = require('../src/controllers/DeptController');


// Setup de Express app con rutas
const app = express();
app.use(express.json());
app.post('/api/v1/departments', departmentsController.createDepartment);
app.get('/api/v1/departments', departmentsController.listDepartments);

describe('Pruebas críticas de DepartmentsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Debe crear un departamento nuevo', async () => {
    mockPrisma.departments.findUnique.mockResolvedValue(null);
    mockPrisma.departments.create.mockResolvedValue({
      id: 'd1',
      name: 'CARDIOLOGIA',
      description: 'Departamento de cardiología'
    });

    const res = await request(app).post('/api/v1/departments').send({
      name: 'Cardiología',
      description: 'Departamento de cardiología'
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Departamento creado exitosamente');
    expect(res.body.department.name).toBe('CARDIOLOGIA');
  });

  test('Debe rechazar si falta el nombre', async () => {
    const res = await request(app).post('/api/v1/departments').send({
      description: 'Sin nombre'
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('El nombre del departamento es obligatorio');
  });

  test('Debe rechazar si el departamento ya existe', async () => {
    mockPrisma.departments.findUnique.mockResolvedValue({
      id: 'd1',
      name: 'CARDIOLOGIA'
    });

    const res = await request(app).post('/api/v1/departments').send({
      name: 'Cardiología',
      description: 'Departamento duplicado'
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('El departamento ya existe');
  });

  test('Debe listar departamentos', async () => {
    mockPrisma.departments.findMany.mockResolvedValue([
      { id: 'd1', name: 'CARDIOLOGIA', description: 'Cardio' },
      { id: 'd2', name: 'PEDIATRIA', description: 'Niños' }
    ]);

    const res = await request(app).get('/api/v1/departments');

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('CARDIOLOGIA');
  });

  test('Debe manejar error en el servidor al crear', async () => {
    mockPrisma.departments.findUnique.mockRejectedValue(new Error('DB error'));

    const res = await request(app).post('/api/v1/departments').send({
      name: 'Urgencias',
      description: 'Emergencias'
    });

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe('Error en el servidor');
  });

  test('Debe manejar error en el servidor al listar', async () => {
    mockPrisma.departments.findMany.mockRejectedValue(new Error('DB error'));

    const res = await request(app).get('/api/v1/departments');

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe('Error en el servidor');
  });
});
