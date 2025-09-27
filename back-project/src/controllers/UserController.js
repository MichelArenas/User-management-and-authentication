const {PrismaClient} = require ("../generated/prisma");
const prisma = new PrismaClient();
const bcrypt = require("bcrypt");

const VALID_ROLES = ["ADMIN", "MEDICO", "ENFERMERO", "PACIENTE"];

const createByAdmin = async (req, res) => {
  try {
    let { email, fullname, password, role } = req.body;

    if (!email || !fullname || !role) {
      return res.status(400).json({ message: "email, fullname y role son obligatorios" });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: "Rol inválido" });
    }

    email = email.toLowerCase().trim();

    // Validaciones de email y password
    const emailRegex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "El correo electrónico no es válido" });
    }

    const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({
            message: "La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número"
        });
    }

    // Verificar si ya existe
    const existingUser = await prisma.users.findUnique({
        where: { email }
    });
    if (existingUser) {
        return res.status(400).json({ message: "El correo ya está registrado" });
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    //Guardar en la base de datos
    const newUser = await prisma.users.create({ 
      data: { 
        email,
        fullname,
        role,
        password: hashedPassword,
        isActive: true
    },
      select: { id: true, email: true, fullname: true, role: true, isActive: true }
    });

    return res.status(201).json({ 
        message: "Usuario creado", 
        user:{
            id:newUser.id,
            email: newUser.email,
            fullname: newUser.fullname,
            role: newUser.role
        } });
  } catch (error) { 
    console.error("createByAdmin error:", error);
    return res.status(500).json({ message: "Error creando usuario" });
  }
};

// Listar todos los usuarios (solo ADMIN)
const listAll = async (_req, res) => {
  try {
    if (_req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "No tienes permisos para realizar esta acción" });
    }

    const users = await prisma.users.findMany({
      select: { id: true, email: true, fullname: true, role: true, isActive: true, createdAt: true }
    });

    return res.json(users);
  } catch (error) {
    console.error("listAll error:", error);
    return res.status(500).json({ message: "Error listando usuarios" });
  }
};


// Desactivar usuario (solo ADMIN)
const deactivate = async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "No tienes permisos para realizar esta acción" });
    }

    await prisma.users.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });

    return res.json({ message: "Usuario desactivado" });
  } catch (error) {
    console.error("deactivate error:", error);
    return res.status(500).json({ message: "Error desactivando usuario" });
  }
};

// Activar usuario (solo ADMIN)
const activate = async (req, res) => {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "No tienes permisos para realizar esta acción" });
    }

    await prisma.users.update({
      where: { id: req.params.id },
      data: { isActive: true }
    });

    return res.json({ message: "Usuario activado" });
  } catch (error) {
    console.error("activate error:", error);
    return res.status(500).json({ message: "Error activando usuario" });
  }
};

const updatePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    // Verificar formato de la nueva contraseña
    const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        message: "La nueva contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número"
      });
    }

    // Verificar que el usuario existe
    const user = await prisma.users.findUnique({
      where: { id }
    });

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Verificar que el usuario autenticado está modificando su propia contraseña o es admin
    if (req.user.id !== id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: "No tienes permisos para realizar esta acción" });
    }

    // Verificar contraseña actual
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "La contraseña actual es incorrecta" });
    }

    // Verificar que la nueva contraseña no sea igual a la actual
    if (currentPassword === newPassword) {
      return res.status(400).json({ 
        message: "La nueva contraseña no puede ser igual a la actual" 
      });
    }

    // Hash de la nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Actualizar la contraseña
    const updatedUser = await prisma.users.update({
      where: { id },
      data: { 
        password: hashedPassword,
        updatedAt: new Date()
      }
    });

    res.status(200).json({ 
      message: "Contraseña actualizada correctamente",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        fullname: updatedUser.fullname,
        role: updatedUser.role
      }
    });
  } catch (error) {
    console.error("Error al actualizar la contraseña:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

module.exports = {
  createByAdmin,
  listAll,
  deactivate,
  activate,
  updatePassword
};