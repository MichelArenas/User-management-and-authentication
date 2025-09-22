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

const listAll =  async (_req, res) => {
    try {
    const users = await prisma.users.findMany({ // <- USERS
      select: { id: true, email: true, fullname: true, role: true, isActive: true, createdAt: true }
    });
    return res.json(users);
  } catch (error) {
    console.error("listAll error:", error);
    return res.status(500).json({ message: "Error listando usuarios" });
  }
};


const  deactivate = async (req, res) => {
    try {
    await prisma.users.update({ // <- USERS
      where: { id: req.params.id },
      data: { isActive: false }
    });
    return res.json({ message: "Usuario desactivado" });
  } catch (error) {
    console.error("deactivate error:", error);
    return res.status(500).json({ message: "Error desactivando usuario" });
  }
};

module.exports ={createByAdmin,listAll, deactivate };