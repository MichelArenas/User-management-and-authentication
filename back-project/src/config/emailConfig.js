const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");

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

function formatDuration(minutes) {
  if (minutes % (24*60) === 0) {
    const days = minutes / (24*60);
    return days === 1 ? "1 día" : `${days} días`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hora" : `${hours} horas`;
  }
  return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
}

// Plantilla HTML para correo de activación de cuenta
const getActivationEmailTemplate = (fullname, activationCode) => {
  return `
  <div style="font-family: Arial, sans-serif; background-color: #F9FAFB; padding: 30px;">
    <div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #E6F9F0, #D0F2E0); border-radius: 12px; box-shadow: 0 6px 18px rgba(0,0,0,0.1); padding: 30px; text-align: center;">
      
      <img src="cid:medcore-logo" alt="MedCore Logo" style="width: 80px; margin-bottom: 20px;" />
      
      <h2 style="color: #333;">¡Bienvenido, ${fullname}!</h2>
      <p style="color: #444; font-size: 15px;">
        Gracias por registrarte en <strong>MedCore</strong>.  
        Para activar tu cuenta, utiliza el siguiente código:
      </p>
      
      <div style="background: linear-gradient(90deg, #88D4AB, #6ECF97); padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h1 style="font-size: 36px; letter-spacing: 6px; color: #fff; margin: 0;">${activationCode}</h1>
      </div>
      
      <p style="color: #444; font-size: 14px;">
        Este código expirará en <strong>${expiresText}</strong>.  
        Si no solicitaste esta cuenta, ignora este correo.
      </p>
      
      <p style="font-size: 12px; color: #777; margin-top: 30px;">
        © 2025 MedCore. Todos los derechos reservados.
      </p>
    </div>
  </div>
  `;
};

// Plantilla HTML para correo de verificación 2FA
const get2FAEmailTemplate = (fullname, verificationCode) => {
  return `
  <div style="font-family: Arial, sans-serif; background-color: #F9FAFB; padding: 30px;">
    <div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #E6F5FB, #D0EBF9); border-radius: 12px; box-shadow: 0 6px 18px rgba(0,0,0,0.1); padding: 30px; text-align: center;">
      
      <img src="cid:medcore-logo" alt="MedCore Logo" style="width: 80px; margin-bottom: 20px;" />
      
      <h2 style="color: #333;">Hola ${fullname},</h2>
      <p style="color: #444; font-size: 15px;">
        Para continuar con tu inicio de sesión, ingresa el siguiente código:
      </p>
      
      <div style="background: linear-gradient(90deg, #7DC3E8, #5BB0DB); padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h1 style="font-size: 36px; letter-spacing: 6px; color: #fff; margin: 0;">${verificationCode}</h1>
      </div>
      
      <p style="color: #444; font-size: 14px;">
        Este código es válido por <strong>10 minutos</strong>.  
        Si no intentaste iniciar sesión, cambia tu contraseña de inmediato.
      </p>
      
      <p style="font-size: 12px; color: #777; margin-top: 30px;">
        © 2025 MedCore. Todos los derechos reservados.
      </p>
    </div>
  </div>
  `;
};

// Función para enviar email de activación de cuenta
const sendVerificationEmail = async (email, fullname, verificationCode, expiresMinutes) => {
  // Ruta al archivo del logo
  const logoPath = path.join(__dirname, '../../public/images/logo.png');
  
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: "Activa tu cuenta en MedCore",
    html: getActivationEmailTemplate(fullname, verificationCode, expiresMinutes),
    attachments: [
      {
        filename: 'logo.png',
        path: logoPath,
        cid: 'medcore-logo'
      }
    ]
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Correo de activación enviado:", info.response);
    return { success: true, info };
  } catch (error) {
    console.error("❌ Error al enviar email de activación:", error);
    return { success: false, error };
  }
};

// Función para enviar email de código 2FA
const send2FAEmail = async (email, fullname, verificationCode) => {
  // Ruta al archivo del logo
  const logoPath = path.join(__dirname, '../../public/images/logo.png');
  
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: "Código de verificación para inicio de sesión",
    html: get2FAEmailTemplate(fullname, verificationCode),
    attachments: [
      {
        filename: 'logo.png',
        path: logoPath,
        cid: 'medcore-logo'
      }
    ]
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Correo 2FA enviado:", info.response);
    return { success: true, info };
  } catch (error) {
    console.error("❌ Error al enviar email 2FA:", error);
    return { success: false, error };
  }
};

module.exports = {
  generateVerificationCode,
  sendVerificationEmail,
  send2FAEmail,
  transporter
};