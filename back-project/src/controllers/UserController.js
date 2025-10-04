const {PrismaClient} = require ("../generated/prisma");
const prisma = new PrismaClient();
const bcrypt = require("bcryptjs");
const { generateVerificationCode, sendVerificationEmail} = require('../config/emailConfig');
const roleMiddleware = require('../middlewares/roleMiddelware');
const { 
  logActivity, 
  logCreate, 
  logUpdate, 
  logDelete, 
  logView,
  logLogin,
  logLogout,
  logLoginFailed,
  sanitizeObject 
} = require('../services/loggerService');
const { error } = require("console");
const {prepareBulkUsersFromCsv} = require("../services/bulkImportService");

const {  VALID_ROLES,
  isEmailValid,
  isPasswordStrong,
} = require("../utils/userUtils");

function buildBulkVerification(status) {
  const st = String(status || "PENDING").toUpperCase();
  if (st !== "PENDING") {
    return { verificationCode: null, verificationCodeExpires: null };
  }
  const verificationCode = generateVerificationCode();
  const expires = new Date();
  expires.setMinutes(expires.getMinutes() + 60); // 60 minutos de validez
  return { verificationCode, verificationCodeExpires: expires };
}

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
    if (!isEmailValid(email)) {
        return res.status(400).json({ message: "El correo electrónico no es válido" });
    }

    if (!isPasswordStrong(password)) {
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

    // Incluye el código de verificación → 15 minutos
    const verificationCode = generateVerificationCode();
    const verificationExpires = new Date();
    verificationExpires.setMinutes(verificationExpires.getMinutes() + 15);
    
    //Guardar en la base de datos
    const newUser = await prisma.users.create({ 
      data: { 
        email,
        fullname,
        role,
        password: hashedPassword,
        isActive: true,
        status: "PENDING",
        verificationCode,
        verificationCodeExpires: verificationExpires
    },
      select: { id: true, email: true, fullname: true, role: true, isActive: true, status: true }
    });

    // Registrar creación de usuario
    await logCreate('User', newUser, req.user, req, `Admin ${req.user.fullname} creó nuevo usuario con rol: ${role}`);

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
        message: "Usuario creado exitosamente. Se ha enviado un email de verificación.",
        user: {
            id:newUser.id,
            email: newUser.email,
            fullname: newUser.fullname,
            role: newUser.role,
            isActive: newUser.isActive,
            status: newUser.status
        } });
  } catch (error) { 
    console.error("createByAdmin error:", error);
    return res.status(500).json({ message: "Error creando usuario" });
  }
};

// Listar todos los usuarios
const getAllUsers = async (_req, res) => {
  try {
    if (_req.user.role !== "ADMINISTRADOR") {
      return res.status(403).json({ message: "No tienes permisos para realizar esta acción" });
    }

    const users = await prisma.users.findMany({
      select: { id: true, email: true, fullname: true, role: true, isActive: true, createdAt: true }
    });
    
    // Registrar consulta de usuarios (opcional)
    await logActivity({
      action: 'LIST',
      entityType: 'User',
      userId: _req.user.id,
      userEmail: _req.user.email,
      userName: _req.user.fullname,
      details: `Consulta de lista de usuarios por ${_req.user.email}`,
      req: _req
    });

    return res.json(users);
  } catch (error) {
    console.error("listAll error:", error);
    return res.status(500).json({ message: "Error listando usuarios" });
  }
};

// buscar 1 usuario
const getUserById = async (req, res) => {
  try {
    const user = await prisma.users.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, fullname: true, role: true, isActive: true, status: true, createdAt: true }
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    console.error("[PUBLIC] get user error:", error);
    res.status(500).json({ message: "Error consultando usuario" });
  }
};


// Desactivar usuario
const deactivate = async (req, res) => {
  try {
    if (req.user.role !== "ADMINISTRADOR") {
      return res.status(403).json({ message: "No tienes permisos para realizar esta acción" });
    }

    // Obtener usuario antes de actualizar
    const user = await prisma.users.findUnique({
      where: { id: req.params.id }
    });

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const updatedUser = await prisma.users.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });

    await logUpdate(
      'User', 
      sanitizeObject(user), 
      sanitizeObject(updatedUser), 
      req.user, 
      req, 
      `Usuario ${user.email} desactivado por ${req.user.email}`
    );

    return res.json({ message: "Usuario desactivado" });
  } catch (error) {
    console.error("deactivate error:", error);
    return res.status(500).json({ message: "Error desactivando usuario" });
  }
};

// Activar usuario
const activate = async (req, res) => {
  try {
    if (req.user.role !== "ADMINISTRADOR") {
      return res.status(403).json({ message: "No tienes permisos para realizar esta acción" });
    }

    // Obtener usuario antes de actualizar
    const user = await prisma.users.findUnique({
      where: { id: req.params.id }
    });

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const updatedUser = await prisma.users.update({
      where: { id: req.params.id },
      data: { isActive: true }
    });
    
    await logUpdate(
      'User', 
      sanitizeObject(user), 
      sanitizeObject(updatedUser), 
      req.user, 
      req, 
      `Usuario ${user.email} activado por ${req.user.email}`
    );

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
    if (req.user.id !== id && req.user.role !== 'ADMINISTRADOR') {
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

    // Registrar cambio de contraseña
    const sanitizedOldUser = { ...user, password: '[REDACTED]' };
    const sanitizedNewUser = { ...updatedUser, password: '[REDACTED]' };

    await logUpdate(
      'User', 
      sanitizedOldUser, 
      sanitizedNewUser, 
      req.user, 
      req, 
      `Actualización de contraseña para usuario: ${user.email}`
    );

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

// Recupera logs de actividad con paginación y filtros
const getActivityLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, userId, action, fromDate, toDate } = req.query;
    
    // Construir filtro
    const filter = {};
    
    if (userId) filter.userId = userId;
    if (action) filter.action = action;
    
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.gte = new Date(fromDate);
      if (toDate) filter.createdAt.lte = new Date(toDate);
    }
    
    // Obtener registros
    const logs = await prisma.activityLog.findMany({
      where: filter,
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
      include: {
        user: {
          select: {
            fullname: true,
            email: true,
            role: true
          }
        }
      }
    });
    
    const totalLogs = await prisma.activityLog.count({ where: filter });
    
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
    console.error("Error al recuperar registros:", error);
    return res.status(500).json({ message: "Error al recuperar registros" });
  }
};

const bulkImport = async (req, res) => {
  try {
    // 1) Validar archivo
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: "Adjunta un archivo CSV en el campo 'file' (multipart/form-data)" });
    }
    console.log(`[IMPORT] Archivo recibido: ${req.file.originalname} (${req.file.mimetype}) size=${req.file.size}`);

    //Parsear CSV robusto
    const { records, toInsert, errors, duplicatesCSV } = prepareBulkUsersFromCsv(req.file.buffer);
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ message: "El archivo CSV está vacío o no tiene el formato correcto" });
    }
    console.log(`[IMPORT] Registros leídos: ${records.length}`);
    console.log(`[VALIDATION] A insertar: ${toInsert.length}, errores: ${errors.length}, dupCSV: ${duplicatesCSV.length}`);

    //Duplicados en BD
    const existingUsers = await prisma.users.findMany({
      where: { email: { in: toInsert.map(r => r.email) } },
      select: { email: true }
    });
    const existingEmails = new Set(existingUsers.map(u => u.email));
    const duplicatesDB = [];
    const finalBatch = toInsert.filter(r => {
      if (existingEmails.has(r.email)) {
        duplicatesDB.push({ email: r.email, error: "Email ya existe en la base de datos" });
        return false;
      }
      return true;
    });
    console.log(`[DUPLICATES] dupBD: ${duplicatesDB.length}, finalBatch: ${finalBatch.length}`);

    //Insertar
    const inserted = [];
    const toEmail = [];

    for (const userData of finalBatch) {
      try{
        const hashed = await bcrypt.hash(userData.passwordPlain, 10);

        //fallback por si normalizeStatus devuelve indefinido
        const effectiveStatus = (userData.status || "PENDING").toUpperCase();

        //Generar verificación si el estado es PENDING
        const { verificationCode, verificationCodeExpires } = buildBulkVerification(effectiveStatus);

        const newUser = await prisma.users.create({
          data: {
            email: userData.email,
            fullname: userData.fullname,
            role: userData.role,
            status: effectiveStatus,
            isActive: true,
            password: hashed,
            ...(effectiveStatus === "PENDING" && verificationCode?{
              verificationCode,
              verificationCodeExpires
            }:{}),
          },
          select: { id: true, email: true, fullname: true, role: true, isActive: true, status: true }
        });
        inserted.push(newUser);
        //Enviar email si el estado es PENDING
        if(newUser.status === "PENDING" && verificationCode){
          toEmail.push({ email: newUser.email, fullname: newUser.fullname, code: verificationCode });
        }
      }catch (e) {
        console.error("[INSERT] Error al insertar usuario:", userData.email, e.message);
        errors.push({ email: userData.email, error: "Error al insertar usuario en BD", detail: e?.message });
      }
    }
    console.log(`[INSERT] Insertados OK: ${inserted.length}`);

    //Enviar emails
    // Enviar emails (al final, en lote)
    let emailsOk = 0;
    let emailsFail = 0;

    if (toEmail.length) {
      const results = await Promise.allSettled(
        toEmail.map(({ email, fullname, code }) =>
          sendVerificationEmail(email, fullname, code)
        )
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          const v = r.value;
          const success =
            v?.success === true ||                                 // tu servicio ya normaliza
            (typeof v === "string" && v.startsWith("250 ")) ||     // string SMTP
            (v?.response && v.response.startsWith("250 ")) ||      // Nodemailer: info.response
            (Array.isArray(v?.accepted) && v.accepted.length > 0); // Nodemailer: info.accepted

          success ? emailsOk++ : emailsFail++;
        } else {
          emailsFail++;
        }
      }
      console.log(`[EMAILS] Enviados OK: ${emailsOk}, Fallidos: ${emailsFail}`);
    }

      
    //Log de actividad
    try {
      await logActivity({
        action: "USUARIOS_IMPORTADOS",
        userId: req.user?.id,
        userEmail: req.user?.email,
        details: `Import masivo: recibidos=${records.length}, insertados=${inserted.length}, errores=${errors.length}, dupCSV=${duplicatesCSV.length}, dupBD=${duplicatesDB.length}`,
        req
      });
    } catch (logErr) {
      console.error("[LOG] No se pudo registrar actividad:", logErr.message);
    }

    return res.status(200).json({
      message: `Importación completada. Total filas: ${records.length}, Insertados: ${inserted.length}, Errores: ${errors.length}, Duplicados CSV: ${duplicatesCSV.length}, Duplicados BD: ${duplicatesDB.length}`,
      inserted,
      duplicatesCSV,
      duplicatesDB,
      errors
    });

  } catch (error) {
    console.error("[IMPORT] Error inesperado:", error);
    return res.status(500).json({ message: "Error interno del servidor por la importación masiva" });
  }
};

const getAllPatients = async (_req, res) => {
  try {
    if (_req.user.role !== "ADMINISTRADOR" && _req.user.role !== "MEDICO") {
      return res.status(403).json({ message: "No tienes permisos para realizar esta acción" });
    }
    const pacientes = await prisma.users.findMany({
      where: { role: "PACIENTE" },
      select: { id: true, email: true, fullname: true, role: true, isActive: true, status: true, createdAt: true }
    });
    res.json(pacientes);
  } catch (error) {
    console.error("getAllPatients error:", error);
    res.status(500).json({ message: "Error consultando pacientes" });
  }
};

// Actualizar datos de un paciente
const updatePatient = async (req, res) => {
  try {
    const { id } = req.params;
    const { fullname, email, isActive } = req.body;

    // Solo ADMIN puede actualizar pacientes
    if (req.user.role !== "ADMINISTRADOR") {
      return res.status(403).json({ message: "No tienes permisos para actualizar pacientes" });
    }

    // Verificar que el usuario sea un PACIENTE
    const existingPatient = await prisma.users.findUnique({ where: { id } });
    if (!existingPatient) {
      return res.status(404).json({ message: "Paciente no encontrado" });
    }
    if (existingPatient.role !== "PACIENTE") {
      return res.status(400).json({ message: "El usuario no es un paciente" });
    }

    // Actualizar paciente
   // Actualizar paciente
const updatedPatient = await prisma.users.update({
  where: { id },
  data: {
    fullname: fullname ?? existingPatient.fullname,
    email: email ? email.toLowerCase().trim() : existingPatient.email,
    isActive: typeof isActive === "boolean" ? isActive : existingPatient.isActive,
    updatedAt: new Date()
  },
  select: {
    id: true,
    email: true,
    fullname: true,
    role: true,
    isActive: true,
    updatedAt: true
  }
});


    return res.json(updatedPatient);
  } catch (error) {
    console.error("updatePatient error:", error);
    return res.status(500).json({ message: "Error actualizando paciente" });
  }
};


module.exports = {
  createByAdmin,
  getAllUsers,
  getUserById,
  deactivate,
  activate,
  updatePassword,
  getActivityLogs,
  bulkImport,
  getAllPatients,
  updatePatient
};