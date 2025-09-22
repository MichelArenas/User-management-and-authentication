const { PrismaClient } = require("../generated/prisma");
const prisma = new PrismaClient();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

// Almacén temporal para códigos de verificación
const verificationCodes = {};

// Configuración de Nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Función para generar código de 6 dígitos
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Función para enviar email con código
const sendVerificationEmail = async (email, code) => {
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: "Código de verificación para inicio de sesión",
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 5px;">
        <h2 style="color: #333;">Verificación de dos factores</h2>
        <p>Tu código de verificación es:</p>
        <h1 style="font-size: 32px; letter-spacing: 5px; background-color: #f5f5f5; padding: 10px; text-align: center; border-radius: 4px;">${code}</h1>
        <p>Este código expirará en 10 minutos.</p>
        <p>Si no solicitaste este código, por favor ignora este correo.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

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

        // Guardar en la base de datos
        const newUser = await prisma.users.create({
            data: {
                email,
                password: hashedPassword,
                fullname,
                role: "ADMIN",
            }
        });

        return res.status(201).json({
            message: "Usuario registrado correctamente",
            user: {
                id: newUser.id,
                email: newUser.email,
                fullname: newUser.fullname
            }
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Error en el servidor" });
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
    //Validar si el usuario esta activado
    if (user.isActive === false){
      return res.status(403).json({ message: "Usuario desactivado, contacta al administrador" });
    }
    
    // Verificar contraseña
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }
    
    // Si se proporciona un código de verificación, validarlo
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
      //Validar que el usuario esté activo antes de loguear
      if (!user?.isActive){
        return res.status(401).json({ message: "Credenciales invalidas"})
      }
      
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
      // Primera fase: enviar código de verificación
      const verificationCode = generateVerificationCode();
      
      // Guardar el código temporalmente
      verificationCodes[email] = {
        code: verificationCode,
        timestamp: new Date()
      };
      
      // Enviar email con el código
      await sendVerificationEmail(email, verificationCode);
      
      return res.status(200).json({
        message: "Código de verificación enviado",
        requiresVerification: true
      });
    }
  } catch (error) {
    console.error("Error en signin:", error);
    return res.status(500).json({ message: "Error en el servidor" });
  }
};

module.exports = { signup, signin, prisma };