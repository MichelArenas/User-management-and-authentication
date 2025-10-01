const jwt = require('jsonwebtoken');
const authMiddleware = require('../src/middlewares/authMiddelware'); // Ajusta la ruta según tu estructura

// Mock de jwt
jest.mock('jsonwebtoken');

describe('Middleware de Autenticación - Pruebas de Seguridad y Manejo de Sesión', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
    process.env.JWT_SECRET = 'test-secret-key';
    jest.clearAllMocks();
  });

  describe('Pruebas de Validación de Token', () => {
    test('debe rechazar la solicitud sin cabecera de autorización', () => {
      authMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Token requerido' });
      expect(next).not.toHaveBeenCalled();
    });

    test('debe rechazar la solicitud con cabecera de autorización vacía', () => {
      req.headers.authorization = '';
      authMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Token requerido' });
      expect(next).not.toHaveBeenCalled();
    });

    test('debe rechazar la solicitud sin el prefijo Bearer', () => {
      req.headers.authorization = 'token-invalido';
      authMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Token requerido' });
    });

    test('debe rechazar la solicitud con Bearer pero sin token', () => {
      req.headers.authorization = 'Bearer ';
      authMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Token requerido' });
    });

    test('debe aceptar un token válido con formato Bearer', () => {
      const mockPayload = { userId: '123', role: 'ADMINISTRADOR', email: 'admin@test.com' };
      req.headers.authorization = 'Bearer valid-jwt-token';
      jwt.verify.mockReturnValue(mockPayload);

      authMiddleware(req, res, next);

      expect(jwt.verify).toHaveBeenCalledWith('valid-jwt-token', process.env.JWT_SECRET);
      expect(req.user).toEqual({
        id: mockPayload.userId,
        role: mockPayload.role,
        email: mockPayload.email
      });
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Pruebas de Contexto de Usuario', () => {
    test('debe asignar correctamente el contexto de usuario con todos los campos requeridos', () => {
      const mockPayload = { userId: '456', role: 'MEDICO', email: 'doctor@test.com' };
      req.headers.authorization = 'Bearer valid-token';
      jwt.verify.mockReturnValue(mockPayload);

      authMiddleware(req, res, next);

      expect(req.user.id).toBe('456');
      expect(req.user.role).toBe('MEDICO');
      expect(req.user.email).toBe('doctor@test.com');
      expect(next).toHaveBeenCalled();
    });

    test('debe manejar un token con rol ADMIN', () => {
      const mockPayload = { userId: '1', role: 'ADMINISTRADOR', email: 'admin@test.com' };
      req.headers.authorization = 'Bearer admin-token';
      jwt.verify.mockReturnValue(mockPayload);

      authMiddleware(req, res, next);
      expect(req.user.role).toBe('ADMINISTRADOR');
    });

    test('debe manejar un token con rol MEDICO', () => {
      const mockPayload = { userId: '2', role: 'MEDICO', email: 'medico@test.com' };
      req.headers.authorization = 'Bearer medico-token';
      jwt.verify.mockReturnValue(mockPayload);

      authMiddleware(req, res, next);
      expect(req.user.role).toBe('MEDICO');
    });
  });


});
