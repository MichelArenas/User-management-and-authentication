const jwt = require("jsonwebtoken");

module.exports = (req, rest, next) =>{
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ' ) ? auth.slice(7) : null;
    if (!token) 
        return rest.status(401).json({message:"Token requerido"});
    try{
        const p = jwt.verify(token, process.env.JWT_SECRET);
        req.user = {id: p.userId, role: p.role, email: p.email};
        next();
    }catch{
        return res.status(401).json({ message: 'Token inválido o expirado' });
    }
}