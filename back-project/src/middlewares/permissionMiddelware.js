// src/middlewares/requirePermission.js
const permissions = require('../auth/permissions');

module.exports = (permissionKey) => (req, res, next) => {
  const role = req.user?.role; // viene del authMiddleware (JWT)
  if (!role) return res.status(401).json({ message: 'No autenticado' });

  const allowed = permissions[role] || [];
  if (!allowed.includes(permissionKey)) {
    return res.status(403).json({ message: 'No tienes permisos' });
  }
  next();
};
