
// test/AuthController.test.js
const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock de Prisma
const mockPrisma = {
  users: {
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  userDeptRoles:{
    findMany: jest.fn()
  }
};

// Mock del módulo Prisma
jest.mock('../src/generated/prisma', () => ({
  PrismaClient: jest.fn(() => mockPrisma)
}));

// Mock email (incluye 2FA)
jest.mock('../src/config/emailConfig', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({ success: true }),
  send2FAEmail: jest.fn().mockResolvedValue({ success: true }),
  generateVerificationCode: jest.fn(() => '123456'),
}));

// Importar controller
const { signup, signin, resendVerificationCode, verifyEmail } = require('../src/controllers/AuthController');

const app = express();
app.use(express.json());

// Rutas
app.post('/api/v1/auth/sign-up', signup);
app.post('/api/v1/auth/sign-in', signin);
app.post('/api/v1/auth/resend-verification', resendVerificationCode);
app.post('/api/v1/auth/verify-email', verifyEmail);

// Helper para generar JWT de prueba
function generateTestToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, fullname: user.fullname, role: user.role },
    process.env.JWT_SECRET || 'testsecret',
    { expiresIn: '1h' }
  );
}

describe('AuthController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.userDeptRoles.findMany.mockResolvedValue([]);
  });

  /** ---------- SIGNUP TESTS ---------- */
  test('Signup falla si la contraseña es débil', async () => {
    const res = await request(app)
      .post('/api/v1/auth/sign-up')
      .send({ email: 'test@example.com', fullname: 'Test User', password: '123' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/contraseña/i);
  });

  test('Signup exitoso crea usuario PENDING', async () => {
    mockPrisma.users.count.mockResolvedValue(0);
    mockPrisma.users.findUnique.mockResolvedValue(null);
    mockPrisma.users.create.mockResolvedValue({ id: 'user1', email: 'test@example.com', fullname: 'Test User', status: 'PENDING' });

    // Mock envío de email
    jest.mock('../src/config/emailConfig', () => ({
      sendVerificationEmail: jest.fn().mockResolvedValue({ success: true }),
      generateVerificationCode: () => '123456'
    }));

    const res = await request(app)
      .post('/api/v1/auth/sign-up')
      .send({ email: 'test@example.com', fullname: 'Test User', password: 'Password123' });

    expect(res.statusCode).toBe(201);
    expect(res.body.user.status).toBe('PENDING');
  });

  /** ---------- SIGNIN TESTS ---------- */
  test('Signin falla si usuario no existe', async () => {
    mockPrisma.users.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/sign-in')
      .send({ email: 'nonexist@example.com', password: 'Password123' });

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toMatch(/credenciales/i);
  });

  test('Signin con cuenta deshabilitada por admin', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user1',
      email: 'test@example.com',
      password: await bcrypt.hash('Password123', 10),
      status: 'ACTIVE',
      isActive: false
    });

    const res = await request(app)
      .post('/api/v1/auth/sign-in')
      .send({ email: 'test@example.com', password: 'Password123' });

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toMatch(/deshabilitada/i);
  });

  test('Signin genera código 2FA si no se envió código', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user1',
      email: 'test@example.com',
      fullname: 'Test User',
      password: await bcrypt.hash('Password123', 10),
      status: 'ACTIVE',
      isActive: true
    });

    const res = await request(app)
      .post('/api/v1/auth/sign-in')
      .send({ email: 'test@example.com', password: 'Password123' });

    expect(res.statusCode).toBe(200);
    expect(res.body.requiresVerification).toBe(true);
  });

  /** ---------- VERIFY EMAIL TESTS ---------- */
  test('VerifyEmail falla si código es incorrecto', async () => {
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user1',
      email: 'test@example.com',
      status: 'PENDING',
      verificationCode: '123456',
      verificationCodeExpires: new Date(Date.now() + 10000)
    });

    const res = await request(app)
      .post('/api/v1/auth/verify-email')
      .send({ email: 'test@example.com', verificationCode: 'wrong' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/incorrecto/i);
  });

});