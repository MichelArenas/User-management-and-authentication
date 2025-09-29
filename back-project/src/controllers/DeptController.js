const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

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
    return res.status(201).json({ message: "Departamento creado exitosamente", department });
  } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Error en el servidor" });
  }
};

const listDepartments = async (_req, res) => {
  try {
    const depts = await prisma.departments.findMany();
    return res.json(depts);
  } catch (error) {
    console.error("listDepartments error:", error);
    return res.status(500).json({ message: "Error en el servidor" });
  }
};
module.exports = {createDepartment, listDepartments};