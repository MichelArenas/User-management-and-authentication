const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { generateVerificationCode, sendVerificationEmail } = require('../config/emailConfig');
const { logActivity } = require('../config/loggerService');

const verificationCodes = {};

const signup = async (req, res) => {
    try {
        let { email, password, fullname } = req.body;

        if (!email || !password || !fullname) {
            return res.status(400).json({ message: "Faltan datos obligatorios" });
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

        const count = await prisma.users.count();
        if (count > 0) {
        return res.status(403).json({ message: "Registro deshabilitado. Pide a un ADMIN que te cree." });
        }

        // Incluye el código de verificación → 15 minutos
        const verificationCode = generateVerificationCode();
        const verificationExpires = new Date();
        verificationExpires.setMinutes(verificationExpires.getMinutes() + 15);

        // Guardar en la base de datos
        const newUser = await prisma.users.create({
            data: {
                email,
                password: hashedPassword,
                fullname,
                role: "ADMIN",
                status: "PENDING",
                verificationCode,
                verificationCodeExpires: verificationExpires
            }
        });

        const emailResult = await sendVerificationEmail(email, fullname, verificationCode);
        if (!emailResult.success) {
          await prisma.users.delete({ where: { id: newUser.id } });
          return res.status(500).json({ message: "Error al enviar el correo de verificación" });
        }

        return res.status(201).json({
            message: "Usuario registrado correctamente",
            user: {
                id: newUser.id,
                email: newUser.email,
                fullname: newUser.fullname,
                status: newUser.status,
            }
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Error en el servidor" });
    }
};

const verifyEmail = async (req, res) => {
  try {
    const { email, verificationCode } = req.body;
    if (!email || !verificationCode) {
      return res.status(400).json({
        message: "Email y código de verificación son requeridos",
      });
    }

    // Buscar usuario por email
    const user = await prisma.users.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (user.status === "ACTIVE") {
      return res.status(400).json({ message: "La cuenta ya está verificada" });
    }

    // Verificar si el código ha expirado
    if (new Date() > user.verificationCodeExpires) {
      return res.status(400).json({
        message: "El código de verificación ha expirado",
      });
    }

    // Verificar el código
    if (user.verificationCode !== verificationCode) {
      return res.status(400).json({
        message: "Código de verificación incorrecto",
      });
    }

    // Activar la cuenta
    const updatedUser = await prisma.users.update({
      where: { id: user.id },
      data: {
        status: "ACTIVE",
        verificationCode: null,
        verificationCodeExpires: null,
      },
    });

    //Registrar activacion de cuenta
    await logActivity({
      action: "CUENTA_ACTIVADA",
      userId: updatedUser.id,
      userEmail: updatedUser.email,
      details: "Usuario verificó su email y activó su cuenta",
      req
    });

    return res.status(200).json({
      message: "Email verificado exitosamente. Tu cuenta está ahora activa. Por favor, inicia sesión para acceder.",
      accountActivated: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        fullname: updatedUser.fullname,
        status: updatedUser.status,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
};

const resendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email es requerido" });
    }

    const user = await prisma.users.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    if (user.status === "ACTIVE") {
      return res.status(400).json({ message: "La cuenta ya está verificada" });
    }

    // Generar nuevo código
    const verificationCode = generateVerificationCode();
    const verificationExpires = new Date();
    verificationExpires.setMinutes(verificationExpires.getMinutes() + 15);

    // Actualizar usuario con nuevo código
    await prisma.users.update({
      where: { id: user.id },
      data: {
        verificationCode,
        verificationCodeExpires: verificationExpires,
      },
    });

    // Enviar nuevo email
    const emailResult = await sendVerificationEmail(
      email,
      user.fullname,
      verificationCode
    );

    if (!emailResult.success) {
      return res.status(500).json({
        message: "Error enviando email de verificación",
      });
    }

    return res.status(200).json({
      message: "Nuevo código de verificación enviado a tu email",
    });
  } catch (error) {
    console.error("Error en resendVerificationCode:", error);
    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
};

const signin = async (req, res) => {
  try {
    let { email, password, verificationCode } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: "Email y contraseña son obligatorios" });
    }
    
    email = email.toLowerCase().trim();
    
    // Buscar usuario por email
    const user = await prisma.users.findUnique({
      where: { email }
    });
    
    if (!user) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    // Verificar si la cuenta está activa
    if (user.status !== "ACTIVE") {
      return res.status(403).json({ 
        message: "Tu cuenta no está activada. Por favor, verifica tu email con el código que te enviamos.",
        requiresVerification: true,
        verificationType: "EMAIL"
      });
    }

    // Validar si está habilitado por el admin
    if (user.isActive === false) {
      return res.status(403).json({
        message: "Tu cuenta está deshabilitada por el administrador. Contacta con soporte."
      });
    }

    // Verificar contraseña
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }
    
    // Si el usuario proporciona un código de verificación, validar 2FA
    if (verificationCode) {
      const storedVerificationData = verificationCodes[email];
      
      if (!storedVerificationData || storedVerificationData.code !== verificationCode) {
        return res.status(401).json({ message: "Código de verificación inválido" });
      }
      
      // Verificar si el código ha expirado (10 minutos)
      const now = new Date();
      if (now - storedVerificationData.timestamp > 10 * 60 * 1000) {
        delete verificationCodes[email];
        return res.status(401).json({ message: "El código de verificación ha expirado" });
      }
      
      // Código válido, eliminar del almacén temporal
      delete verificationCodes[email];
      
      // Generar JWT con información del usuario
      const token = jwt.sign(
        { 
          userId: user.id,
          email: user.email,
          fullname: user.fullname,
          role: user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
      );

      // Registrar inicio de sesión
      await logActivity({
        action: "INICIO_SESION",
        userId: user.id,
        userEmail: user.email,
        details: `Usuario inició sesión exitosamente con rol: ${user.role}`,
        req
      });
      
      return res.status(200).json({
        message: "Autenticación exitosa",
        token,
        user: {
          id: user.id,
          email: user.email,
          fullname: user.fullname,
          role: user.role
        }
      });
    } else {
      // Primera fase: enviar código de verificación 2FA
      const code = generateVerificationCode();
      
      // Guardar el código temporalmente
      verificationCodes[email] = {
        code: code,
        timestamp: new Date()
      };
      
      // Enviar email con el código
      await sendVerificationEmail(email, user.fullname, code);
      
      return res.status(200).json({
        message: "Código de verificación enviado al email",
        requiresVerification: true,
        verificationType: "2FA",
        step: "2FA"
      });
    }
  } catch (error) {
    console.error("Error en signin:", error);
    return res.status(500).json({ message: "Error en el servidor" });
  }
};

// Crear usuarios desde ADMIN
const createUserByAdmin = async (req, res) => {
  try {
    // Verificar si es administrador
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({
        message: "No tienes permisos para realizar esta acción",
      });
    }

    let { email, password, fullname, role } = req.body;

    if (!email || !password || !fullname || !role) {
      return res.status(400).json({
        message: "Todos los campos son obligatorios",
      });
    }

    email = email.toLowerCase().trim();

    // Validaciones de email y password
    const emailRegex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: "El formato del email es inválido",
      });
    }

    const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message:
          "La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número",
      });
    }

    // Verificar si el usuario ya existe
    const existingUser = await prisma.users.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({
        message: "El email ya está registrado",
      });
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generar código de verificación
    const verificationCode = generateVerificationCode();
    const verificationExpires = new Date();
    verificationExpires.setMinutes(verificationExpires.getMinutes() + 15);

    // Crear el nuevo usuario con estado pendiente
    const newUser = await prisma.users.create({
      data: {
        email,
        password: hashedPassword,
        fullname,
        role,
        status: "PENDING", // El usuario empieza con estado pendiente
        verificationCode,
        verificationCodeExpires: verificationExpires
      },
    });

    // Registrar creación de usuario
    await logActivity({
      action: "USUARIO_CREADO",
      userId: req.user.id,
      userEmail: req.user.email,
      details: `Administrador creó nuevo usuario: ${email} con rol: ${role}`,
      req
    });

    // Enviar email con el código de verificación
    const emailResult = await sendVerificationEmail(
      email,
      fullname,
      verificationCode
    );

    if (!emailResult.success) {
      // Si falla el envío del email, eliminamos el usuario creado
      await prisma.users.delete({
        where: { id: newUser.id },
      });

      return res.status(500).json({
        message: "Error al enviar el email de verificación",
        error: emailResult.error,
      });
    }

    return res.status(201).json({
      message: "Usuario creado exitosamente. Se ha enviado un código de verificación al email del usuario.",
      user: {
        id: newUser.id,
        email: newUser.email,
        fullname: newUser.fullname,
        role: newUser.role,
        status: newUser.status,
      },
    });
  } catch (error) {
    console.error("Error en createUserByAdmin:", error);
    return res.status(500).json({
      message: "Error interno del servidor",
    });
  }
};

const logout = async (req, res) => {
  try {
    // Registrar actividad de cierre de sesión
    await logActivity({
      action: "CIERRE_SESION",
      userId: req.user.id,
      userEmail: req.user.email,
      details: "Usuario cerró sesión",
      req
    });
    
    return res.status(200).json({ message: "Cierre de sesión exitoso" });
  } catch (error) {
    console.error("Error en logout:", error);
    return res.status(500).json({ message: "Error en el servidor" });
  }
};



module.exports = { 
  signup, 
  signin, 
  createUserByAdmin, 
  resendVerificationCode, 
  verifyEmail,
  logout,
  prisma
};
