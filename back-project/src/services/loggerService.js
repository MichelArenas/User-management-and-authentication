const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

/**
 * @param {Object} options
 * @param {string} options.action
 * @param {string} [options.entityType] 
 * @param {string} [options.entityId] 
 * @param {Object} [options.oldValues] 
 * @param {Object} [options.newValues] 
 * @param {string} [options.userId] 
 * @param {string} [options.userEmail] 
 * @param {string} [options.userName] 
 * @param {string} [options.details] 
 * @param {Object} [options.req] 
 * @returns {Promise<Object>} 
 */
const logActivity = async (options) => {
  try {
    const { 
      action, 
      entityType, 
      entityId, 
      oldValues, 
      newValues, 
      userId, 
      userEmail, 
      userName,
      details, 
      req 
    } = options;
    
    if (!action) {
      console.error("Action is required for activity logging");
      return null;
    }
    
    const logData = {
      action,
      entityType: entityType || null,
      entityId: entityId || null,
      oldValues: oldValues || null,
      newValues: newValues || null,
      userId: userId || null,
      userEmail: userEmail || null,
      userName: userName || null,
      details: details || null,
    };
    
    if (req) {
      logData.ipAddress = req.ip || 
        req.headers['x-forwarded-for'] || 
        req.connection.remoteAddress;
        
      logData.userAgent = req.headers['user-agent'];
    }
    
    // Asegurarse de que los objetos JSON sean serializables
    if (logData.oldValues) {
      logData.oldValues = JSON.parse(JSON.stringify(logData.oldValues));
    }
    if (logData.newValues) {
      logData.newValues = JSON.parse(JSON.stringify(logData.newValues));
    }
    
    const activityLog = await prisma.activityLog.create({ data: logData });
    return activityLog;
  } catch (error) {
    console.error("Error logging activity:", error);
    // No lanzar error para evitar interrumpir el flujo principal
    return null;
  }
};

const logCreate = async (entityType, entity, user, req, details = null) => {
  return await logActivity({
    action: 'CREATE',
    entityType,
    entityId: entity.id,
    newValues: entity,
    userId: user.id,
    userEmail: user.email,
    userName: user.fullname,
    details,
    req
  });
};

const logUpdate = async (entityType, oldEntity, newEntity, user, req, details = null) => {
  return await logActivity({
    action: 'UPDATE',
    entityType,
    entityId: newEntity.id,
    oldValues: oldEntity,
    newValues: newEntity,
    userId: user.id,
    userEmail: user.email,
    userName: user.fullname,
    details,
    req
  });
};

const logDelete = async (entityType, entity, user, req, details = null) => {
  return await logActivity({
    action: 'DELETE',
    entityType,
    entityId: entity.id,
    oldValues: entity,
    userId: user.id,
    userEmail: user.email,
    userName: user.fullname,
    details,
    req
  });
};

const logView = async (entityType, entityId, user, req, details = null) => {
  return await logActivity({
    action: 'VIEW',
    entityType,
    entityId,
    userId: user.id,
    userEmail: user.email,
    userName: user.fullname,
    details,
    req
  });
};

const logLogin = async (user, req, details = null) => {
  return await logActivity({
    action: 'LOGIN',
    entityType: 'User',
    entityId: user.id,
    userId: user.id,
    userEmail: user.email,
    userName: user.fullname,
    details: details || `Inicio de sesión exitoso con rol: ${user.role}`,
    req
  });
};

const logLogout = async (user, req, details = null) => {
  return await logActivity({
    action: 'LOGOUT',
    entityType: 'User',
    entityId: user.id,
    userId: user.id,
    userEmail: user.email,
    userName: user.fullname,
    details: details || 'Cierre de sesión exitoso',
    req
  });
};

const logLoginFailed = async (email, req, details = null) => {
  return await logActivity({
    action: 'LOGIN_FAILED',
    entityType: 'User',
    userEmail: email,
    details: details || `Intento fallido de inicio de sesión para: ${email}`,
    req
  });
};

/**
 * Sanitiza un objeto para eliminar campos sensibles
 * @param {Object} obj - Objeto a sanitizar
 * @param {Array<string>} sensitiveFields - Campos a redactar
 * @returns {Object} Objeto sanitizado
 */
const sanitizeObject = (obj, sensitiveFields = ['password', 'verificationCode']) => {
  if (!obj) return null;
  
  const sanitized = {...obj};
  
  sensitiveFields.forEach(field => {
    if (sanitized[field] !== undefined) {
      sanitized[field] = '[REDACTED]';
    }
  });
  
  return sanitized;
};

module.exports = {
  logActivity,
  logCreate,
  logUpdate,
  logDelete,
  logView,
  logLogin,
  logLogout,
  logLoginFailed,
  sanitizeObject
};