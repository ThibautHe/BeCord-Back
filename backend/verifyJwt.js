const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  console.log('Authorization Header reçu:', authHeader); // Log du header reçu

  if (!authHeader) {
    return res.status(403).json({ message: 'Un token est requis pour accéder à cette ressource.' });
  }

  const token = authHeader.split(' ')[1];
  console.log('Token extrait:', token); // Log du token extrait

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token décodé:', decoded); // Log du contenu décodé
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Erreur lors de la validation du token:', error.message);
    return res.status(401).json({ message: 'Token invalide.' });
  }
};

module.exports = verifyToken;