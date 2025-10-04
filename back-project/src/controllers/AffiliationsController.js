// controllers/AffiliationController.js
const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();
const { 
  logCreate, 
  logUpdate, 
  logDelete, 
  logView,
  sanitizeObject 
} = require('../services/loggerService');

const VALID_ROLES = ["ADMINISTRADOR","MEDICO","ENFERMERO","PACIENTE"];

const createAffiliation = async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        message: "Cuerpo vacío o inválido. Envía JSON con Content-Type: application/json."
      });
    }

    let { userId, role, departmentId, specialtyId } = req.body;

    if (!userId || !role) {
      return res.status(400).json({ message: "userId y role son obligatorios" });
    }
    role = String(role).toUpperCase().trim();
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: `role inválido. Permitidos: ${VALID_ROLES.join(", ")}` });
    }

    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    let deptId = departmentId || null;
    let specId = specialtyId || null;

    if (specId) {
      const sp = await prisma.specialties.findUnique({
        where: { id: specId },
        include: { department: { select: { id: true } } }
      });
      if (!sp) return res.status(404).json({ message: "Especialidad no encontrada" });
      if (deptId && deptId !== sp.department.id) {
        return res.status(400).json({ message: "departmentId no coincide con la especialidad" });
      }
      deptId = sp.department.id; // deducimos dept desde specialty
    } else if (deptId) {
      const dept = await prisma.departments.findUnique({ where: { id: deptId } });
      if (!dept) return res.status(404).json({ message: "Departamento no encontrado" });
    } else {
      return res.status(400).json({ message: "Debes enviar specialtyId o departmentId" });
    }

    const exists = await prisma.userDeptRoles.findFirst({
      where: { userId, departmentId: deptId, specialtyId: specId || null, role }
    });
    if (exists) return res.status(409).json({ message: "La afiliación ya existe" });

    const record = await prisma.userDeptRoles.create({
      data: { userId, departmentId: deptId, specialtyId: specId || null, role }
    });
    
    // Obtener información de departamento y especialidad para el registro
    const dept = await prisma.departments.findUnique({
      where: { id: deptId },
      select: { name: true }
    });
    
    const specialty = specId ? await prisma.specialties.findUnique({
      where: { id: specId },
      select: { name: true }
    }) : null;
    
    // Registrar creación de afiliación
    await logCreate(
      'Affiliation', 
      {
        ...record,
        departmentName: dept?.name,
        specialtyName: specialty?.name,
        userName: user.name
      }, 
      req.user, 
      req, 
      `Afiliación creada para usuario ${user.email} como ${role} en ${dept?.name}${specialty ? ', especialidad ' + specialty.name : ''} por ${req.user?.email || 'usuario no autenticado'}`
    );

    return res.status(201).json({ message: "Afiliación creada", affiliation: record });
  } catch (error) {
    console.error("createAffiliation error:", error);
    return res.status(500).json({ message: "Error creando afiliación" });
  }
};

const listAffiliationsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const items = await prisma.userDeptRoles.findMany({
      where: { userId },
      include: {
        department: { select: { id: true, name: true } },
        specialty:  { select: { id: true, name: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    
    // Obtener información del usuario para el registro
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { email: true, name: true }
    });
    
    // Registrar visualización de afiliaciones
    await logView(
      'Affiliation', 
      { userId, userName: user?.name, count: items.length },
      req.user, 
      req, 
      `Afiliaciones de usuario ${user?.email || userId} consultadas por ${req.user?.email || 'usuario no autenticado'}`
    );
    
    return res.json(items);
  } catch (error) {
    console.error("listAffiliationsByUser error:", error);
    return res.status(500).json({ message: "Error listando afiliaciones" });
  }
};

const deleteAffiliation = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Obtener datos de afiliación para el registro
    const affiliation = await prisma.userDeptRoles.findUnique({
      where: { id },
      include: {
        user: { select: { email: true, name: true } },
        department: { select: { name: true } },
        specialty: { select: { name: true } }
      }
    });
    
    if (!affiliation) {
      return res.status(404).json({ message: "Afiliación no encontrada" });
    }
    
    await prisma.userDeptRoles.delete({ where: { id } });
    
    // Registrar eliminación de afiliación
    await logDelete(
      'Affiliation', 
      affiliation, 
      req.user, 
      req, 
      `Afiliación eliminada: ${affiliation.user.email} como ${affiliation.role} en ${affiliation.department.name}${affiliation.specialty ? ', especialidad ' + affiliation.specialty.name : ''} por ${req.user?.email || 'usuario no autenticado'}`
    );
    return res.json({ message: "Afiliación eliminada" });
  } catch (error) {
    console.error("deleteAffiliation error:", error);
    return res.status(500).json({ message: "Error eliminando afiliación" });
  }
};

module.exports = { createAffiliation, listAffiliationsByUser, deleteAffiliation };
