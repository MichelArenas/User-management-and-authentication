// test/UsersController.extended.test.js
const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Mock de Prisma
const mockPrisma = {
  users: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn()
  }
};

// Mock del módulo Prisma
jest.mock('../src/generated/prisma', () => ({
  PrismaClient: jest.fn(() => mockPrisma)
}));

// Importar controller
const { createByAdmin, listAll, deactivate, activate, updatePassword } = require('../src/controllers/UserController');

const app = express();
app.use(express.json());

// Middleware para simular req.user desde header
app.use((req, res, next) => {
  const headerUser = req.headers['authorization-user'];
  req.user = headerUser ? JSON.parse(headerUser) : null;
  next();
});

// Rutas
app.post('/api/v1/users', createByAdmin);
app.get('/api/v1/users', listAll);
app.patch('/api/v1/users/:id/deactivate', deactivate);
app.patch('/api/v1/users/:id/activate', activate);
app.patch('/api/v1/users/:id/password', updatePassword);

// Helper para generar token (opcional)
function generateTestToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, fullname: user.fullname, role: user.role },
    process.env.JWT_SECRET || 'testsecret',
    { expiresIn: '1h' }
  );
}

describe('UsersController Extended Tests', () => {
  beforeEach(() => jest.clearAllMocks());

  /** ---------- ROLE-BASED ACCESS TESTING ---------- */
 /* test('Usuario no ADMIN no puede crear usuario', async () => {
    const mockUser = { id: 'user1', role: 'PACIENTE' };
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization-User', JSON.stringify(mockUser))
      .send({ email: 'x@x.com', fullname: 'Test', password: 'Pass1234', role: 'PACIENTE' });

    expect(res.statusCode).toBe(403);
  });*/

  test('ADMIN puede crear usuario', async () => {
    const mockAdmin = { id: 'admin1', role: 'ADMIN' };
    mockPrisma.users.create.mockResolvedValue({
      id: 'user2',
      email: 'x@x.com',
      fullname: 'Test',
      role: 'PACIENTE',
      isActive: true
    });

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization-User', JSON.stringify(mockAdmin))
      .send({ email: 'x@x.com', fullname: 'Test', password: 'Pass1234', role: 'PACIENTE' });

    expect(res.statusCode).toBe(201);
    expect(res.body.user.email).toBe('x@x.com');
  });

  test('Usuario no ADMIN no puede desactivar otro usuario', async () => {
    const mockUser = { id: 'user1', role: 'PACIENTE' };
    const res = await request(app)
      .patch('/api/v1/users/user2/deactivate')
      .set('Authorization-User', JSON.stringify(mockUser));

    expect(res.statusCode).toBe(403);
  });

  test('ADMIN puede desactivar usuario', async () => {
    const mockAdmin = { id: 'admin1', role: 'ADMIN' };
    mockPrisma.users.update.mockResolvedValue({ id: 'user2', isActive: false });

    const res = await request(app)
      .patch('/api/v1/users/user2/deactivate')
      .set('Authorization-User', JSON.stringify(mockAdmin));

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/desactivado/i);
  });

  test('ADMIN puede listar usuarios', async () => {
    const mockAdmin = { id: 'admin1', role: 'ADMIN' };
    mockPrisma.users.findMany.mockResolvedValue([{ id: 'user1', email: 'u@e.com', role: 'PACIENTE' }]);

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization-User', JSON.stringify(mockAdmin));

    expect(res.statusCode).toBe(200);
    expect(res.body.length).toBe(1);
  });

  /** ---------- SESSION MANAGEMENT TESTING ---------- */
  test('Usuario actual puede actualizar su contraseña correctamente', async () => {
    const hashed = await bcrypt.hash('Password123', 10);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user1',
      password: hashed,
      email: 'u@e.com',
      fullname: 'User',
      role: 'PACIENTE'
    });
    mockPrisma.users.update.mockResolvedValue({
      id: 'user1',
      email: 'u@e.com',
      fullname: 'User',
      role: 'PACIENTE'
    });

    const res = await request(app)
      .patch('/api/v1/users/user1/password')
      .set('Authorization-User', JSON.stringify({ id: 'user1', role: 'PACIENTE' }))
      .send({ currentPassword: 'Password123', newPassword: 'NewPass123' });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/actualizada/i);
  });

  test('ADMIN puede actualizar contraseña de otro usuario', async () => {
    const hashed = await bcrypt.hash('Password123', 10);
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user2',
      password: hashed,
      email: 'u2@e.com',
      fullname: 'User2',
      role: 'PACIENTE'
    });
    mockPrisma.users.update.mockResolvedValue({
      id: 'user2',
      email: 'u2@e.com',
      fullname: 'User2',
      role: 'PACIENTE'
    });

    const mockAdmin = { id: 'admin1', role: 'ADMIN' };

    const res = await request(app)
      .patch('/api/v1/users/user2/password')
      .set('Authorization-User', JSON.stringify(mockAdmin))
      .send({ currentPassword: 'Password123', newPassword: 'NewPass123' });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/actualizada/i);
  });
});
