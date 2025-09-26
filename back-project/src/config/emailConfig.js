const nodemailer = require("nodemailer");

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

// Función para enviar email con código de verificación
const sendVerificationEmail = async (email, fullname, verificationCode) => {
  const mailOptions = {
    from: process.env.SMTP_USER,
    to: email,
    subject: "Código de verificación para inicio de sesión",
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 5px;">
        <h2 style="color: #333;">Hola ${fullname}</h2>
        <p>Tu código de verificación es:</p>
        <h1 style="font-size: 32px; letter-spacing: 5px; background-color: #f5f5f5; padding: 10px; text-align: center; border-radius: 4px;">${verificationCode}</h1>
        <p>Este código expirará en 15 minutos.</p>
        <p>Si no solicitaste este código, por favor ignora este correo.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Código de verificación enviado a ${email}`);
    return { success: true };
  } catch (error) {
    console.error("Error al enviar email:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  generateVerificationCode,
  sendVerificationEmail,
  transporter
};