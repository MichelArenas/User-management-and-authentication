const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();
const { 
  logActivity, 
  logCreate, 
  logUpdate, 
  logDelete, 
  logView,
  sanitizeObject 
} = require('../services/loggerService');

const createDepartment = async (req, res) => {
  try {
    let { name, description } = req.body;
    if (!name) {
        return res.status(400).json({ message: "El nombre del departamento es obligatorio" });
    }

      name = name.toUpperCase().trim();

    // Verificar si el departamento ya existe
    const depExists = await prisma.departments.findUnique({
        where: { name: name }
    });
    if (depExists) {
        return res.status(400).json({ message: "El departamento ya existe" });
    }
    // Crear el nuevo departamento
    const department = await prisma.departments.create({
        data: {
            name: name,
            description: description
        }
    });
    
    // Registrar creación de departamento
    await logCreate(
      'Department', 
      department, 
      req.user, 
      req, 
      `Departamento ${name} creado por ${req.user.email}`
    );
    
    return res.status(201).json({ message: "Departamento creado exitosamente", department });
  } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Error en el servidor" });
  }
};

const listDepartments = async (req, res) => {
  try {
    const depts = await prisma.departments.findMany();
    
    // Registrar visualización de departamentos
    await logView(
      'Department', 
      { count: depts.length },
      req.user, 
      req, 
      `Lista de departamentos consultada por ${req.user?.email || 'usuario no autenticado'}`
    );
    
    return res.json(depts);
  } catch (error) {
    console.error("listDepartments error:", error);
    return res.status(500).json({ message: "Error en el servidor" });
  }
};
module.exports = {createDepartment, listDepartments};