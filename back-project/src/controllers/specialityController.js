const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();

/**
 * Crea una especialidad dentro de un departamento
 * Body: { name, departmentId, description? }
 */
const createSpecialty = async (req, res) => {
  try {
    const { name, departmentId, description } = req.body;

    if (!name || !departmentId) {
      return res.status(400).json({ message: "name y departmentId son obligatorios" });
    }

    // 1) Validar departamento existe
    const dept = await prisma.departments.findUnique({ where: { id: departmentId } });
    if (!dept) return res.status(404).json({ message: "Departamento no encontrado" });

    // 2) Evitar duplicados por name (tienes @unique)
    const exists = await prisma.specialties.findUnique({ where: { name } });
    if (exists) return res.status(409).json({ message: "La especialidad ya existe" });

    // 3) Crear
    const sp = await prisma.specialties.create({
      data: {
        name,
        departmentId,
        ...(description ? { description } : {}), // si agregas description al modelo
      },
    });

    return res.status(201).json({ message: "Especialidad creada", specialty: sp });
  } catch (error) {
    console.error("createSpecialty error:", error);
    return res.status(500).json({ message: "Error creando especialidad" });
  }
};

/**
 * Lista todas las especialidades
 */
const listSpecialties = async (_req, res) => {
  try {
    const listSpecialtie = await prisma.specialties.findMany({
      include: { 
        departament: {
          select: { 
            id: true, 
            name: true 
        }
        }
      }
    });
    return res.json(listSpecialtie);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error listando especialidades" });
  }
};

/**
 * Lista especialidades por departamento
 * Params: :departmentId
 */
const listByDepartment = async (req, res) => {
  try {
    const { departmentId } = req.params;

    const dept = await prisma.departments.findUnique({ where: { id: departmentId } });
    if (!dept) return res.status(404).json({ message: "Departamento no encontrado" });

    const list = await prisma.specialties.findMany({
      where: { departmentId },
      orderBy: { name: "asc" },
    });

    return res.json(list);
  } catch (error) {
    console.error("listByDepartment error:", error);
    return res.status(500).json({ message: "Error listando por departamento" });
  }
};

/**
 * Actualiza nombre y/o mueve la especialidad a otro departamento
 * Params: :id
 * Body: { name?, departmentId? }
 */
const updateSpecialty = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, departmentId } = req.body;

    const data = {};

    if (name) {
      // si cambias el nombre, opcionalmente verifica duplicado
      const dup = await prisma.specialties.findUnique({ where: { name } });
      if (dup && dup.id !== id) {
        return res.status(409).json({ message: "Ya existe una especialidad con ese nombre" });
      }
      data.name = name;
    }

    if (departmentId) {
      const dept = await prisma.departments.findUnique({ where: { id: departmentId } });
      if (!dept) return res.status(404).json({ message: "Departamento destino no encontrado" });
      data.departmentId = departmentId;
    }

    const sp = await prisma.specialties.update({
      where: { id },
      data,
    });

    return res.json({ message: "Especialidad actualizada", specialty: sp });
  } catch (error) {
    console.error("updateSpecialty error:", error);
    return res.status(500).json({ message: "Error actualizando especialidad" });
  }
};

/**
 * Elimina una especialidad
 * Params: :id
 * (Si tuvieras datos dependientes, evalúa borrado lógico en lugar de delete)
 */
const deleteSpecialty = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.specialties.delete({ where: { id } });
    return res.json({ message: "Especialidad eliminada" });
  } catch (error) {
    console.error("deleteSpecialty error:", error);
    return res.status(500).json({ message: "Error eliminando especialidad" });
  }
};

module.exports = {
  createSpecialty,
  listSpecialties,
  listByDepartment,
  updateSpecialty,
  deleteSpecialty,
};
