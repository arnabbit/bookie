const authMiddleware = require('./auth');
const User = require('../models/User');

const adminMiddleware = (req, res, next) => {
  authMiddleware(req, res, async () => {
    try {
      const user = await User.findById(req.user.id).select('isAdmin');
      if (!user?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      next();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
};

module.exports = adminMiddleware;
