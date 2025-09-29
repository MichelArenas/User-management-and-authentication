const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

/**
 * Registrar actividad del usuario
 * @param {Object} options - Opciones de registro
 * @param {string} options.action - La acción realizada
 * @param {string} [options.userId] - ID del usuario (si está disponible)
 * @param {string} [options.userEmail] - Email del usuario (si está disponible)
 * @param {string} [options.details] - Detalles adicionales
 * @param {Object} [options.req] - Objeto request de Express (para extraer IP y agente de usuario)
 */
const logActivity = async (options) => {
  try {
    const { action, userId, userEmail, details, req } = options;
    
    const logData = {
      action,
      details: details || null,
      userId: userId || null,
      userEmail: userEmail || null,
    };
    
    // Si se proporciona el objeto request, extraer IP y agente de usuario
    if (req) {
      logData.ipAddress = req.ip || 
        req.headers['x-forwarded-for'] || 
        req.connection.remoteAddress;
        
      logData.userAgent = req.headers['user-agent'];
    }
    
    await prisma.activityLog.create({ data: logData });
  } catch (error) {
    console.error("Error al registrar actividad:", error);
    // No lanzar error para evitar afectar el flujo principal de la aplicación
  }
};

module.exports = { logActivity };