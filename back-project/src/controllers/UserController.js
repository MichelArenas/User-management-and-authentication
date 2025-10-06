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


const {  
  VALID_ROLES,
  isEmailValid,
  isPasswordStrong,
  calculateAge,
  isValidAge
} = require("../utils/userUtils");

function buildBulkVerification(status) {
  const st = String(status || "PENDING").toUpperCase();
  if (st !== "PENDING") {
    return { verificationCode: null, verificationCodeExpires: null };
  }
  const verificationCode = generateVerificationCode();
  const expires = new Date();
  expires.setHours(expires.getHours() + 24); // 24 horas de validez
  return { verificationCode, verificationCodeExpires: expires };
}

const createByAdmin = async (req, res) => {
  try {
    let { 
      email, 
      fullname, 
      password, 
      role, 
      id_number, 
      id_type, 
      date_of_birth,
      gender,
      phone,
      address,
      city,
      blood_type
    } = req.body;

    // Validaciones de campos obligatorios
    if (!email || !fullname || !role || !id_number || !id_type || !date_of_birth) {
      return res.status(400).json({ 
        message: "Los campos email, fullname, role, id_number, id_type y date_of_birth son obligatorios" 
      });
    }

    // Validación de email y formato
    email = email.toLowerCase().trim();
    if (!isEmailValid(email)) {
      return res.status(400).json({ message: "El correo electrónico no es válido" });
    }

    // Validación de contraseña
    if (!isPasswordStrong(password)) {
      return res.status(400).json({
        message: "La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número"
      });
    }

    // Validar rol
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ message: "Rol inválido" });
    }

    // Validar fecha de nacimiento y calcular edad
    const birthDate = new Date(date_of_birth);
    const today = new Date();
    
    // Verificar que la fecha sea válida
    if (isNaN(birthDate.getTime())) {
      return res.status(400).json({ message: "La fecha de nacimiento no es válida" });
    }
    
    // Calcular edad
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--; // Todavía no ha cumplido años este año
    }
    
    // Validar rango de edad (0-100 años)
    if (age < 0 || age > 100) {
      return res.status(400).json({ 
        message: "La edad debe estar entre 0 y 100 años" 
      });
    }

    // Verificar si ya existe el email
    const existingUserByEmail = await prisma.users.findUnique({
      where: { email }
    });
    
    if (existingUserByEmail) {
      return res.status(400).json({ message: "El correo ya está registrado" });
    }
    
    // Verificar si ya existe el número de identificación
    const existingUserById = await prisma.users.findUnique({
      where: { id_number }
    });
    
    if (existingUserById) {
      return res.status(400).json({ message: "El número de identificación ya está registrado" });
    }

    // Encriptar contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Incluye el código de verificación → 24 horas
    const verificationCode = generateVerificationCode();
    const verificationExpires = new Date();
    verificationExpires.setHours(verificationExpires.getHours() + 24);
    
    // Preparar datos de contacto de emergencia (si existen)
    const emergencyContact = req.body.emergencyContact ? {
      name: req.body.emergencyContact.name,
      phone: req.body.emergencyContact.phone,
      relationship: req.body.emergencyContact.relationship
    } : null;
    
    // Guardar en la base de datos
    const newUser = await prisma.users.create({ 
      data: { 
        email,
        fullname,
        role,
        password: hashedPassword,
        id_number,
        id_type,
        date_of_birth: birthDate,
        age,
        gender: gender || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        blood_type: blood_type || null,
        emergencyContact: emergencyContact,
        isActive: true,
        status: "PENDING",
        verificationCode,
        verificationCodeExpires: verificationExpires
      },
      select: { 
        id: true, 
        email: true, 
        fullname: true, 
        role: true, 
        isActive: true, 
        status: true,
        id_number: true,
        id_type: true,
        date_of_birth: true,
        age: true
      }
    });

    // Registrar creación de usuario
    await logCreate('User', newUser, req.user, req, `Admin ${req.user.fullname} creó nuevo usuario con rol: ${role}`);

    // Enviar email con el código de verificación
    const emailResult = await sendVerificationEmail(email, fullname, verificationCode, 24);

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
        id: newUser.id,
        email: newUser.email,
        fullname: newUser.fullname,
        role: newUser.role,
        isActive: newUser.isActive,
        status: newUser.status,
        id_number: newUser.id_number,
        id_type: newUser.id_type,
        date_of_birth: newUser.date_of_birth,
        age: newUser.age
      }
    });
  } catch (error) { 
    console.error("createByAdmin error:", error);
    return res.status(500).json({ message: "Error creando usuario" });
  }
};

// Listar todos los usuarios
const getAllUsers = async (req, res) => {
  try {
    if (req.user.role !== "ADMINISTRADOR") {
      return res.status(403).json({ message: "No tienes permisos para realizar esta acción" });
    }

    const {
      page = "1",
      limit = "10",
      sortBy = "createdAt",     // email | fullname | role | createdAt | status
      sortOrder = "desc",
      role,
      status,
      q     
    } = req.query;

    // Validaciones / limpieza
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.max(1, parseInt(limit, 10) || 10);

    // Validar campos de ordenamiento permitidos (evita inyección)
    const allowedSortBy = new Set(["email", "fullname", "role", "createdAt", "status"]);
    const allowedSortOrder = new Set(["asc", "desc"]);

    const orderField = allowedSortBy.has(sortBy) ? sortBy : "createdAt";
    const orderDirection = allowedSortOrder.has(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : "desc";

    // Construir filtro where para prisma
    const where = {};

    if (role) where.role = role;
    if (status) where.status = status;

    if (q) {
      // Búsqueda simple: email o fullname contiene q (case-insensitive)
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { fullname: { contains: q, mode: "insensitive" } }
      ];
    }
    // Consulta con paginación y filtros
    const users = await prisma.users.findMany({
      where,
      select: { id: true, email: true, fullname: true, role: true, createdAt: true },
      orderBy: { [orderField]: orderDirection },
      skip: (pageNum - 1) * pageSize,
      take: pageSize
    });
    // Conteo total para paginación
    const totalUsers = await prisma.users.count({ where });
    
    // Registrar consulta de usuarios (opcional)
    try {
      await logActivity({
        action: 'LIST',
        entityId: req.user.id,
        userId: req.user.id,
        oldValues: null,
        newValues: null,
        userEmail: req.user.email,
        userName: req.user.fullname,
        details: `Consulta de lista de usuarios por ${req.user.email}`,
        req // pasar req si tu logger lo espera
      });
    } catch (logErr) {
      console.warn("Error registrando actividad (no crítico):", logErr && logErr.message ? logErr.message : logErr);
    }

    return res.json({
      users,
      pagination: {
        total: totalUsers,
        pages: Math.ceil(totalUsers / pageSize),
        currentPage: pageNum,
        pageSize: pageSize
      }
    });
  } catch (error) {
    console.error("getAllUsers error:", error);
    return res.status(500).json({ message: "Error listando usuarios" });
  }
};

// buscar 1 usuario
const getUserById = async (req, res) => {
  try {
    const user = await prisma.users.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, fullname: true, role: true, status: true, createdAt: true }
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
      data: { status: "DISABLED", updatedAt: new Date() },
      select: { id: true, email: true, fullname: true, role: true, status: true }
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
      data: { status: "ACTIVE", updatedAt: new Date() },
      select: { id: true, email: true, fullname: true, role: true, status: true }
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
            password: hashed,
            ...(effectiveStatus === "PENDING" && verificationCode?{
              verificationCode,
              verificationCodeExpires
            }:{}),
          },
          select: { id: true, email: true, fullname: true, role: true, status: true }
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
          sendVerificationEmail(email, fullname, code, 1440)
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
      select: { id: true, email: true, fullname: true, role: true, status: true, createdAt: true }
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
    const { 
      fullname, 
      email, 
      isActive, 
      date_of_birth,
      id_number,
      id_type,
      gender,
      phone,
      address,
      city,
      blood_type,
      emergencyContact
    } = req.body;

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

    // Validaciones si se actualiza el email
    let validatedEmail = existingPatient.email;
    if (email && email !== existingPatient.email) {
      const emailToCheck = email.toLowerCase().trim();
      
      if (!isEmailValid(emailToCheck)) {
        return res.status(400).json({ message: "El correo electrónico no es válido" });
      }
      
      const emailExists = await prisma.users.findUnique({
        where: { email: emailToCheck }
      });
      
      if (emailExists) {
        return res.status(400).json({ message: "El correo ya está registrado por otro usuario" });
      }
      
      validatedEmail = emailToCheck;
    }

    // Validaciones si se actualiza el número de identificación
    let validatedIdNumber = existingPatient.id_number;
    if (id_number && id_number !== existingPatient.id_number) {
      const idNumberExists = await prisma.users.findUnique({
        where: { id_number }
      });
      
      if (idNumberExists) {
        return res.status(400).json({ message: "El número de identificación ya está registrado por otro usuario" });
      }
      
      validatedIdNumber = id_number;
    }

    // Calcular edad si se actualiza la fecha de nacimiento
    let birthDate = existingPatient.date_of_birth;
    let age = existingPatient.age;
    
    if (date_of_birth) {
      birthDate = new Date(date_of_birth);
      
      if (isNaN(birthDate.getTime())) {
        return res.status(400).json({ message: "La fecha de nacimiento no es válida" });
      }
      
      // Usar la función utilitaria para calcular la edad
      age = calculateAge(birthDate);
      
      if (!isValidAge(age)) {
        return res.status(400).json({ message: "La edad debe estar entre 0 y 100 años" });
      }
    }

    // Preparar datos de actualización
    const updateData = {
      fullname: fullname ?? existingPatient.fullname,
      email: validatedEmail,
      id_number: validatedIdNumber,
      id_type: id_type ?? existingPatient.id_type,
      date_of_birth: birthDate,
      age: age,
      isActive: typeof isActive === "boolean" ? isActive : existingPatient.isActive,
      updatedAt: new Date()
    };
    
    // Campos opcionales
    if (gender !== undefined) updateData.gender = gender;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (blood_type !== undefined) updateData.blood_type = blood_type;
    
    // Datos JSON
    if (emergencyContact !== undefined) {
      updateData.emergencyContact = {
        name: emergencyContact.name || null,
        phone: emergencyContact.phone || null,
        relationship: emergencyContact.relationship || null
      };
    }

    // Actualizar paciente
    const updatedPatient = await prisma.users.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullname: true,
        role: true,
        isActive: true,
        id_number: true,
        id_type: true,
        date_of_birth: true,
        age: true,
        gender: true,
        phone: true,
        address: true,
        city: true,
        blood_type: true,
        emergencyContact: true,
        updatedAt: true
      }
    });

    // Log de actualización
    await logUpdate(
      'User', 
      sanitizeObject(existingPatient),
      sanitizeObject(updatedPatient),
      req.user, 
      req, 
      `Paciente ${existingPatient.fullname} (${existingPatient.email}) actualizado por ${req.user.email}`
    );

    return res.json({
      message: "Paciente actualizado correctamente",
      patient: updatedPatient
    });
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