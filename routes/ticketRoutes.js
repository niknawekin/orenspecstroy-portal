// routes/ticketRoutes.js
const express = require('express');
const router = express.Router();
const { getDB } = require('../data/database');
const { isAuth } = require('../middleware/auth');

// API эндпоинт для отправки заявки из формы
router.post('/create', isAuth, async (req, res) => {
    try {
        const { subject, description, equipment_type, model, urgency, preferred_time, address, phone } = req.body;
        const userId = req.session.user.id; // Берем ID авторизованного пользователя из сессии

        if (!subject || !description) {
            return res.status(400).json({ status: 'error', message: 'Пожалуйста, заполните тему и описание неисправности' });
        }

        const db = getDB();
        await db.run(`
            INSERT INTO tickets (user_id, subject, description, equipment_type, model, urgency, preferred_time, address, phone, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
        `, [
            userId, 
            subject, 
            description, 
            equipment_type || null, 
            model || null, 
            urgency || 'normal', 
            preferred_time || null, 
            address || null, 
            phone || req.session.user.phone
        ]);

        return res.status(201).json({ status: 'success', message: 'Заявка успешно зарегистрирована в системе СПТС!' });
    } catch (err) {
        console.error('[TICKET CREATION ERROR]:', err.message);
        return res.status(500).json({ status: 'error', message: 'Внутренняя ошибка сервера при сохранении заявки' });
    }
});

module.exports = router;