const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();
const { logActivity } = require('../services/loggerService');

const getActivityLogs = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      userId, 
      userEmail,
      action,
      entityType,
      entityId, 
      fromDate, 
      toDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const filter = {};
    
    if (userId) filter.userId = userId;
    if (userEmail) filter.userEmail = userEmail;
    if (action) filter.action = action;
    if (entityType) filter.entityType = entityType;
    if (entityId) filter.entityId = entityId;
    
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.gte = new Date(fromDate);
      if (toDate) {
        const endDate = new Date(toDate);
        endDate.setHours(23, 59, 59, 999);
        filter.createdAt.lte = endDate;
      }
    }
    
    const orderBy = {};
    orderBy[sortBy] = sortOrder.toLowerCase();
    
    const logs = await prisma.activityLog.findMany({
      where: filter,
      orderBy,
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
      include: {
        user: {
          select: {
            id: true,
            fullname: true,
            email: true,
            role: true
          }
        }
      }
    });
    
    const totalLogs = await prisma.activityLog.count({ where: filter });
    
    await logActivity({
      action: "VIEW_LOGS",
      userId: req.user.id,
      userEmail: req.user.email,
      userName: req.user.fullname,
      details: `Usuario consultó ${logs.length} registros de actividad`,
      req
    });
    
    return res.status(200).json({
      logs,
      pagination: {
        total: totalLogs,
        pages: Math.ceil(totalLogs / parseInt(limit)),
        currentPage: parseInt(page),
        pageSize: parseInt(limit)
      }
    });
  } catch (error) {
    console.error("Error retrieving logs:", error);
    return res.status(500).json({ message: "Error retrieving logs" });
  }
};

const getEntityAuditTrail = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    
    const logs = await prisma.activityLog.findMany({
      where: {
        entityType,
        entityId
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        user: {
          select: {
            id: true,
            fullname: true,
            email: true,
            role: true
          }
        }
      }
    });
    
    await logActivity({
      action: "VIEW_ENTITY_AUDIT",
      entityType,
      entityId,
      userId: req.user.id,
      userEmail: req.user.email,
      userName: req.user.fullname,
      details: `Usuario consultó el historial de cambios de ${entityType} #${entityId}`,
      req
    });
    
    return res.status(200).json({ logs });
  } catch (error) {
    console.error("Error retrieving entity audit trail:", error);
    return res.status(500).json({ message: "Error retrieving entity audit trail" });
  }
};

module.exports = {
  getActivityLogs,
  getEntityAuditTrail
};