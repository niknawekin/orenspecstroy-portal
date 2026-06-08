// middlewares/auth.js

// Проверяем, вошел ли пользователь в систему
function isAuth(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
}

// Проверяем, является ли пользователь администратором
function isAdmin(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    res.status(403).send('Доступ запрещен. Требуются права администратора.');
}

module.exports = { isAuth, isAdmin };