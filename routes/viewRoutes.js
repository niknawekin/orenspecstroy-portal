// routes/viewRoutes.js
const express = require('express');
const router = express.Router();
const { getDB } = require('../data/database');
const { isAuth, isAdmin } = require('../middleware/auth');

// Главная страница
router.get('/', async (req, res) => {
    try {
        const db = getDB();
        const services = await db.all("SELECT * FROM services LIMIT 6");
        res.render('index', { services: services || [] });
    } catch (err) {
        console.error(err);
        res.render('index', { services: [] });
    }
});

// Страница входа
router.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('login');
});

// Личный кабинет клиента (Заказчика) — выводит только его заявки
router.get('/dashboard', isAuth, async (req, res) => {
    try {
        const db = getDB();
        const myTickets = await db.all(
            "SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC", 
            [req.session.user.id]
        );
        res.render('dashboard', { user: req.session.user, tickets: myTickets });
    } catch (err) {
        console.error(err);
        res.render('dashboard', { user: req.session.user, tickets: [] });
    }
});

// Форма создания новой заявки
router.get('/create-ticket', isAuth, (req, res) => {
    res.render('create-ticket', { user: req.session.user });
});

// Панель управления администратора — видит абсолютно ВСЕ заявки холдинга
router.get('/admin', isAuth, isAdmin, async (req, res) => {
    try {
        const db = getDB();
        const allTickets = await db.all(`
            SELECT tickets.*, users.fio as client_fio 
            FROM tickets 
            LEFT JOIN users ON tickets.user_id = users.id 
            ORDER BY tickets.created_at DESC
        `);
        res.render('admin', { user: req.session.user, tickets: allTickets });
    } catch (err) {
        console.error(err);
        res.render('admin', { user: req.session.user, tickets: [] });
    }
});

module.exports = router;