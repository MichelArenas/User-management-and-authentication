const authorize = require('../src/middlewares/roleMiddelware');

describe('Middleware de Autorización - Pruebas de Autorización Basada en Roles', () => {
  let req, res, next;

  beforeEach(() => {
    // Configurar mock de request
    req = {
      user: null
    };

    // Configurar mock de response
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    // Configurar mock de next
    next = jest.fn();

    // Limpiar todos los mocks
    jest.clearAllMocks();
  });

  describe('Pruebas de Validación de Autenticación', () => {
    test('debería rechazar la petición sin objeto usuario', () => {
      const middleware = authorize('ADMIN');
      
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'No autenticado' });
      expect(next).not.toHaveBeenCalled();
    });

    test('debería rechazar la petición con usuario nulo', () => {
      const middleware = authorize('ADMIN');
      req.user = null;
      
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'No autenticado' });
      expect(next).not.toHaveBeenCalled();
    });

    test('debería rechazar la petición con usuario pero sin rol', () => {
      const middleware = authorize('ADMIN');
      req.user = { id: '1', email: 'test@test.com' }; // Sin rol
      
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'No autenticado' });
      expect(next).not.toHaveBeenCalled();
    });

    test('debería rechazar la petición con rol indefinido', () => {
      const middleware = authorize('ADMIN');
      req.user = { id: '1', email: 'test@test.com', role: undefined };
      
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'No autenticado' });
      expect(next).not.toHaveBeenCalled();
    });

  });

  describe('Pruebas de Autorización con Rol Único', () => {
    test('debería permitir ADMIN cuando se requiere ADMIN', () => {
      const middleware = authorize('ADMIN');
      req.user = { id: '1', role: 'ADMIN', email: 'admin@test.com' };
      
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    test('debería permitir MEDICO cuando se requiere MEDICO', () => {
      const middleware = authorize('MEDICO');
      req.user = { id: '2', role: 'MEDICO', email: 'medico@test.com' };
      
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('debería permitir ENFERMERO cuando se requiere ENFERMERO', () => {
      const middleware = authorize('ENFERMERO');
      req.user = { id: '3', role: 'ENFERMERO', email: 'enfermero@test.com' };
      
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('debería permitir PACIENTE cuando se requiere PACIENTE', () => {
      const middleware = authorize('PACIENTE');
      req.user = { id: '4', role: 'PACIENTE', email: 'paciente@test.com' };
      
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('debería rechazar MEDICO cuando se requiere ADMIN', () => {
      const middleware = authorize('ADMIN');
      req.user = { id: '2', role: 'MEDICO', email: 'medico@test.com' };
      
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'No tienes permisos' });
      expect(next).not.toHaveBeenCalled();
    });

    test('debería rechazar PACIENTE cuando se requiere MEDICO', () => {
      const middleware = authorize('MEDICO');
      req.user = { id: '4', role: 'PACIENTE', email: 'paciente@test.com' };
      
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'No tienes permisos' });
      expect(next).not.toHaveBeenCalled();
    });
  });

});
