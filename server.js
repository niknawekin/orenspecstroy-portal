const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const { initDB, getDB } = require('./data/database');

const app = express();

// Настройки
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Сессии
app.use(session({
    secret: 'oren-spec-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 }
}));

// Делаем пользователя доступным во всех шаблонах
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// ========== MIDDLEWARE ==========

// Проверка авторизации
function isAuth(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Проверка прав администратора
function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(403).send('Доступ запрещен. Требуются права администратора. <a href="/">На главную</a>');
    }
}

// ========== ПУБЛИЧНЫЕ СТРАНИЦЫ ==========

app.get('/', (req, res) => {
    res.render('index', { title: 'Главная' });
});

app.get('/services', (req, res) => {
    res.render('services');
});

app.get('/kb', (req, res) => {
    res.render('kb');
});

// ========== РЕГИСТРАЦИЯ И ВХОД ==========

app.get('/register', (req, res) => {
    res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
    const { fio, email, phone, password } = req.body;

    try {
        const db = getDB();
        
        const existing = await db.get('SELECT * FROM users WHERE email = ?', [email]);
        if (existing) {
            return res.render('register', { error: 'Пользователь с таким email уже существует' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.run(
            'INSERT INTO users (fio, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
            [fio, email, phone, hashedPassword, 'user']
        );

        req.session.user = {
            id: result.lastID,
            fio: fio,
            email: email,
            role: 'user'
        };

        req.session.save(() => {
            res.redirect('/dashboard');
        });

    } catch (err) {
        console.error(err);
        res.render('register', { error: 'Ошибка сервера, попробуйте позже' });
    }
});

app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const db = getDB();
        const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

        if (!user) {
            return res.render('login', { error: 'Неверный email или пароль' });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.render('login', { error: 'Неверный email или пароль' });
        }

        req.session.user = {
            id: user.id,
            fio: user.fio,
            email: user.email,
            role: user.role
        };

        req.session.save(() => {
            if (user.role === 'admin') {
                res.redirect('/admin');
            } else {
                res.redirect('/dashboard');
            }
        });

    } catch (err) {
        console.error(err);
        res.render('login', { error: 'Ошибка сервера' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// ========== ЛИЧНЫЙ КАБИНЕТ ПОЛЬЗОВАТЕЛЯ ==========

app.get('/dashboard', isAuth, async (req, res) => {
    try {
        const db = getDB();
        const tickets = await db.all(
            'SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC',
            [req.session.user.id]
        );
        res.render('dashboard', { tickets });
    } catch (err) {
        console.error(err);
        res.send('Ошибка загрузки дашборда');
    }
});

// ========== ЗАЯВКИ ==========

app.get('/tickets/new', isAuth, (req, res) => {
    res.render('new-ticket', { error: null });
});

app.post('/tickets/new', isAuth, async (req, res) => {
    try {
        const {
            equipment_type,
            model,
            subject,
            description,
            urgency,
            preferred_time,
            address,
            phone
        } = req.body;
        
        const db = getDB();
        
        const result = await db.run(
            `INSERT INTO tickets (
                user_id, subject, description, equipment_type, model, 
                urgency, preferred_time, address, phone, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.session.user.id,
                subject || 'Без темы',
                description || 'Нет описания',
                equipment_type || null,
                model || null,
                urgency || 'normal',
                preferred_time || null,
                address || null,
                phone || null,
                'Новая'
            ]
        );
        
        res.redirect('/dashboard');
        
    } catch (err) {
        console.error('Ошибка:', err);
        res.render('new-ticket', { error: 'Ошибка при создании заявки: ' + err.message });
    }
});

app.get('/tickets/view/:id', isAuth, async (req, res) => {
    try {
        const db = getDB();
        const ticket = await db.get(
            'SELECT * FROM tickets WHERE id = ? AND user_id = ?',
            [req.params.id, req.session.user.id]
        );
        
        if (!ticket) {
            return res.status(404).send('Заявка не найдена');
        }
        
        const messages = await db.all(
            'SELECT * FROM messages WHERE ticket_id = ? ORDER BY created_at ASC',
            [req.params.id]
        );
        
        res.render('ticket-view', { ticket, messages });
        
    } catch (err) {
        console.error(err);
        res.send('Ошибка загрузки заявки');
    }
});

app.post('/messages/send', isAuth, async (req, res) => {
    try {
        const { ticket_id, message } = req.body;
        const db = getDB();
        
        await db.run(
            'INSERT INTO messages (ticket_id, sender_id, sender_role, message) VALUES (?, ?, ?, ?)',
            [ticket_id, req.session.user.id, 'client', message]
        );
        
        res.redirect(`/tickets/view/${ticket_id}`);
        
    } catch (err) {
        console.error(err);
        res.send('Ошибка отправки сообщения');
    }
});

// ========== АДМИН-ПАНЕЛЬ ==========

// Главная админки (дашборд со статистикой)
app.get('/admin', isAdmin, async (req, res) => {
    try {
        const db = getDB();
        
        // Статистика по заявкам
        const tickets = await db.all(`SELECT * FROM tickets`);
        const users = await db.all(`SELECT * FROM users`);
        
        const stats = {
            totalTickets: tickets.length,
            newTickets: tickets.filter(t => t.status === 'Новая').length,
            processingTickets: tickets.filter(t => t.status === 'В обработке').length,
            completedTickets: tickets.filter(t => t.status === 'Завершено').length,
            totalUsers: users.length,
            todayTickets: tickets.filter(t => {
                const today = new Date().toDateString();
                return new Date(t.created_at).toDateString() === today;
            }).length,
            emergencyTickets: tickets.filter(t => t.urgency === 'emergency').length
        };
        
        // Последние 5 заявок
        const recentTickets = await db.all(`
            SELECT tickets.*, users.fio as user_fio 
            FROM tickets 
            LEFT JOIN users ON tickets.user_id = users.id 
            ORDER BY tickets.created_at DESC 
            LIMIT 5
        `);
        
        res.render('admin/index', { stats, recentTickets });
    } catch (err) {
        console.error(err);
        res.send('Ошибка загрузки админ-панели');
    }
});

// Список пользователей
app.get('/admin/users', isAdmin, async (req, res) => {
    try {
        const db = getDB();
        const users = await db.all(`
            SELECT u.*, COUNT(t.id) as tickets_count 
            FROM users u
            LEFT JOIN tickets t ON u.id = t.user_id
            GROUP BY u.id
            ORDER BY u.created_at DESC
        `);
        res.render('admin/users', { users });
    } catch (err) {
        console.error(err);
        res.send('Ошибка загрузки пользователей');
    }
});
// Редактирование пользователя (GET)
app.get('/admin/users/:id/edit', isAdmin, async (req, res) => {
    try {
        const db = getDB();
        const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
        if (!user) return res.status(404).send('Пользователь не найден');
        res.render('admin/user-edit', { user });
    } catch (err) {
        console.error(err);
        res.send('Ошибка загрузки пользователя');
    }
});

// Обновление пользователя (POST)
app.post('/admin/users/:id/edit', isAdmin, async (req, res) => {
    try {
        const { fio, email, phone, role } = req.body;
        const db = getDB();
        
        await db.run(
            'UPDATE users SET fio = ?, email = ?, phone = ?, role = ? WHERE id = ?',
            [fio, email, phone, role, req.params.id]
        );
        
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        res.send('Ошибка обновления пользователя');
    }
});

// Удаление пользователя
app.post('/admin/users/:id/delete', isAdmin, async (req, res) => {
    try {
        const db = getDB();
        await db.run('DELETE FROM tickets WHERE user_id = ?', [req.params.id]);
        await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        res.send('Ошибка удаления пользователя');
    }
});

// Все заявки с фильтрацией
app.get('/admin/tickets', isAdmin, async (req, res) => {
    try {
        const db = getDB();
        const { status, urgency } = req.query;
        
        let query = `
            SELECT tickets.*, users.fio as user_fio 
            FROM tickets 
            LEFT JOIN users ON tickets.user_id = users.id 
            WHERE 1=1
        `;
        let params = [];
        
        if (status && status !== 'all') {
            query += ' AND tickets.status = ?';
            params.push(status);
        }
        
        if (urgency && urgency !== 'all') {
            query += ' AND tickets.urgency = ?';
            params.push(urgency);
        }
        
        query += ' ORDER BY tickets.created_at DESC';
        
        const tickets = await db.all(query, params);
        res.render('admin/tickets', { tickets, status, urgency });
    } catch (err) {
        console.error(err);
        res.send('Ошибка загрузки заявок');
    }
});
// Назначение специалиста на заявку
app.post('/admin/tickets/:id/assign', isAdmin, async (req, res) => {
    try {
        const { specialist_id, scheduled_date } = req.body;
        const db = getDB();
        
        await db.run(
            'UPDATE tickets SET specialist_id = ?, scheduled_date = ?, status = "В обработке" WHERE id = ?',
            [specialist_id, scheduled_date, req.params.id]
        );
        
        res.redirect(`/admin/tickets/${req.params.id}`);
    } catch (err) {
        console.error(err);
        res.send('Ошибка назначения специалиста');
    }
});

// ===== УПРАВЛЕНИЕ СПЕЦИАЛИСТАМИ =====

// Список специалистов
app.get('/admin/specialists', isAdmin, async (req, res) => {
    try {
        const db = getDB();
        const specialists = await db.all(`
            SELECT * FROM users WHERE role = 'specialist' OR role = 'admin'
        `);
        res.render('admin/specialists', { specialists });
    } catch (err) {
        console.error(err);
        res.send('Ошибка загрузки специалистов');
    }
});

// Добавление пользователя (универсальный)
app.post('/admin/users/add', isAdmin, async (req, res) => {
    try {
        const { fio, email, phone, role } = req.body;
        const db = getDB();
        
        // Проверяем, не существует ли уже такой email
        const existing = await db.get('SELECT * FROM users WHERE email = ?', [email]);
        if (existing) {
            return res.send('Пользователь с таким email уже существует');
        }
        
        // Генерируем временный пароль
        const tempPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        
        await db.run(
            'INSERT INTO users (fio, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
            [fio, email, phone, hashedPassword, role || 'user']
        );
        
        res.redirect('/admin/users');
    } catch (err) {
        console.error(err);
        res.send('Ошибка добавления пользователя: ' + err.message);
    }
});

// ===== УПРАВЛЕНИЕ БАЗОЙ ЗНАНИЙ =====

// Список статей
app.get('/admin/kb', isAdmin, async (req, res) => {
    try {
        const db = getDB();
        const articles = await db.all('SELECT * FROM knowledge_base ORDER BY created_at DESC');
        res.render('admin/kb', { articles });
    } catch (err) {
        console.error(err);
        res.send('Ошибка загрузки статей');
    }
});

// Добавление статьи
app.post('/admin/kb/add', isAdmin, async (req, res) => {
    try {
        const { title, content, category } = req.body;
        const db = getDB();
        
        await db.run(
            'INSERT INTO knowledge_base (title, content, category, author_id) VALUES (?, ?, ?, ?)',
            [title, content, category, req.session.user.id]
        );
        
        res.redirect('/admin/kb');
    } catch (err) {
        console.error(err);
        res.send('Ошибка добавления статьи');
    }
});

// ===== УПРАВЛЕНИЕ ПРАЙС-ЛИСТОМ =====

// Список услуг
app.get('/admin/prices', isAdmin, async (req, res) => {
    try {
        const db = getDB();
        const services = await db.all('SELECT * FROM services ORDER BY category, name');
        res.render('admin/prices', { services });
    } catch (err) {
        console.error(err);
        res.send('Ошибка загрузки прайс-листа');
    }
});

// Обновление цены
app.post('/admin/prices/:id/update', isAdmin, async (req, res) => {
    try {
        const { price } = req.body;
        const db = getDB();
        
        await db.run('UPDATE services SET price = ? WHERE id = ?', [price, req.params.id]);
        res.redirect('/admin/prices');
    } catch (err) {
        console.error(err);
        res.send('Ошибка обновления цены');
    }
});

// ===== СТАТИСТИКА И ОТЧЁТЫ =====

app.get('/admin/reports', isAdmin, async (req, res) => {
    try {
        const db = getDB();
        
        // Получаем все заявки
        const tickets = await db.all(`SELECT * FROM tickets`);
        
        // Базовая статистика
        const stats = {
            totalTickets: tickets.length,
            newTickets: tickets.filter(t => t.status === 'Новая').length,
            processingTickets: tickets.filter(t => t.status === 'В обработке').length,
            completedTickets: tickets.filter(t => t.status === 'Завершено').length,
            totalUsers: (await db.all(`SELECT * FROM users`)).length,
            emergencyTickets: tickets.filter(t => t.urgency === 'emergency').length,
            urgentTickets: tickets.filter(t => t.urgency === 'urgent').length,
            normalTickets: tickets.filter(t => t.urgency === 'normal' || !t.urgency).length
        };
        
        // Статистика по дням (последние 7 дней)
        const dailyStats = await db.all(`
            SELECT 
                strftime('%d.%m', created_at) as date,
                COUNT(*) as count
            FROM tickets
            WHERE created_at >= DATE('now', '-7 days')
            GROUP BY DATE(created_at)
            ORDER BY created_at
        `);
        
        // Если нет данных за 7 дней, добавим заглушку
        if (dailyStats.length === 0) {
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                dailyStats.push({
                    date: `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}`,
                    count: 0
                });
            }
        }
        
        // Статистика по категориям оборудования
        let equipmentStats = await db.all(`
            SELECT 
                equipment_type,
                COUNT(*) as count
            FROM tickets
            WHERE equipment_type IS NOT NULL AND equipment_type != ''
            GROUP BY equipment_type
            ORDER BY count DESC
        `);
        
        // Если нет данных, добавим пример
        if (equipmentStats.length === 0) {
            equipmentStats = [
                { equipment_type: 'Нет данных', count: 0 }
            ];
        }
        
        // Среднее время выполнения заявки (упрощённо, без completed_at)
        const avgCompletionTime = { avg_days: null };
        
        res.render('admin/reports', { 
            stats, 
            dailyStats, 
            equipmentStats, 
            avgCompletionTime 
        });
        
    } catch (err) {
        console.error('Ошибка загрузки статистики:', err);
        res.send(`
            <h2>Ошибка загрузки статистики</h2>
            <p>${err.message}</p>
            <a href="/admin">← Вернуться в админ-панель</a>
        `);
    }
});

// ========== УПРАВЛЕНИЕ СПЕЦИАЛИСТАМИ ==========

// Список специалистов
app.get('/admin/specialists', isAdmin, async (req, res) => {
    try {
        const db = getDB();
        
        const specialists = await db.all(`
            SELECT 
                s.*,
                u.fio,
                u.email,
                u.phone as user_phone,
                COUNT(DISTINCT sc.id) as total_bookings,
                COUNT(DISTINCT CASE WHEN sc.date >= DATE('now') AND sc.is_booked = 1 THEN sc.id END) as upcoming_bookings
            FROM specialists s
            JOIN users u ON s.user_id = u.id
            LEFT JOIN schedule sc ON s.id = sc.specialist_id
            GROUP BY s.id
            ORDER BY s.rating DESC
        `);
        
        res.render('admin/specialists', { specialists });
    } catch (err) {
        console.error(err);
        res.send('Ошибка загрузки специалистов');
    }
});

// Добавление специалиста
app.post('/admin/specialists/add', isAdmin, async (req, res) => {
    try {
        const { fio, email, phone, specialization, experience } = req.body;
        const db = getDB();
        
        // Создаём пользователя
        const hashedPassword = await bcrypt.hash('specialist123', 10);
        const result = await db.run(
            'INSERT INTO users (fio, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
            [fio, email, phone, hashedPassword, 'specialist']
        );
        
        // Создаём запись специалиста
        await db.run(
            'INSERT INTO specialists (user_id, specialization, experience, phone) VALUES (?, ?, ?, ?)',
            [result.lastID, specialization, experience, phone]
        );
        
        res.redirect('/admin/specialists');
    } catch (err) {
        console.error(err);
        res.send('Ошибка добавления специалиста: ' + err.message);
    }
});

// Удаление специалиста
app.post('/admin/specialists/:id/delete', isAdmin, async (req, res) => {
    try {
        const db = getDB();
        const specialist = await db.get('SELECT user_id FROM specialists WHERE id = ?', [req.params.id]);
        
        if (specialist) {
            await db.run('DELETE FROM schedule WHERE specialist_id = ?', [req.params.id]);
            await db.run('DELETE FROM specialists WHERE id = ?', [req.params.id]);
            await db.run('DELETE FROM users WHERE id = ?', [specialist.user_id]);
        }
        
        res.redirect('/admin/specialists');
    } catch (err) {
        console.error(err);
        res.send('Ошибка удаления специалиста');
    }
});

// ========== КАЛЕНДАРЬ ЗАНЯТОСТИ ==========

// Просмотр календаря специалиста
app.get('/admin/specialists/:id/calendar', isAdmin, async (req, res) => {
    try {
        const db = getDB();
        
        const specialist = await db.get(`
            SELECT s.*, u.fio, u.email 
            FROM specialists s
            JOIN users u ON s.user_id = u.id
            WHERE s.id = ?
        `, [req.params.id]);
        
        if (!specialist) {
            return res.status(404).send('Специалист не найден');
        }
        
        // Получаем расписание на ближайшие 14 дней
        const schedule = await db.all(`
            SELECT 
                sc.*,
                t.subject as ticket_subject,
                t.id as ticket_id,
                u.fio as client_fio
            FROM schedule sc
            LEFT JOIN tickets t ON sc.ticket_id = t.id
            LEFT JOIN users u ON t.user_id = u.id
            WHERE sc.specialist_id = ? AND sc.date >= DATE('now')
            ORDER BY sc.date, sc.time_slot
        `, [req.params.id]);
        
        // Получаем все временные слоты
        const timeSlots = await db.all('SELECT * FROM time_slots ORDER BY sort_order');
        
        res.render('admin/calendar', { specialist, schedule, timeSlots });
    } catch (err) {
        console.error(err);
        res.send('Ошибка загрузки календаря');
    }
});

// Добавление бронирования в календарь
app.post('/admin/schedule/add', isAdmin, async (req, res) => {
    try {
        const { specialist_id, date, time_slot, ticket_id } = req.body;
        const db = getDB();
        
        // Проверяем, не занят ли слот
        const existing = await db.get(
            'SELECT * FROM schedule WHERE specialist_id = ? AND date = ? AND time_slot = ? AND is_booked = 1',
            [specialist_id, date, time_slot]
        );
        
        if (existing) {
            return res.json({ success: false, error: 'Этот слот уже занят' });
        }
        
        await db.run(
            'INSERT INTO schedule (specialist_id, date, time_slot, is_booked, ticket_id) VALUES (?, ?, ?, 1, ?)',
            [specialist_id, date, time_slot, ticket_id]
        );
        
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: err.message });
    }
});

// Отмена бронирования
app.post('/admin/schedule/:id/cancel', isAdmin, async (req, res) => {
    try {
        const db = getDB();
        await db.run('DELETE FROM schedule WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});

// API: Получить свободные слоты для специалиста (для формы заявки)
app.get('/api/specialists/:id/free-slots', isAdmin, async (req, res) => {
    try {
        const { date } = req.query;
        const db = getDB();
        
        const bookedSlots = await db.all(
            'SELECT time_slot FROM schedule WHERE specialist_id = ? AND date = ? AND is_booked = 1',
            [req.params.id, date]
        );
        
        const allSlots = await db.all('SELECT slot_time FROM time_slots ORDER BY sort_order');
        const bookedTimes = bookedSlots.map(s => s.time_slot);
        
        const freeSlots = allSlots.filter(slot => !bookedTimes.includes(slot.slot_time));
        
        res.json({ freeSlots });
    } catch (err) {
        console.error(err);
        res.json({ error: err.message });
    }
});

// Автоматическое назначение специалиста при создании заявки (дополните существующий POST /tickets/new)
// Добавьте этот код в обработчик создания заявки после вставки в БД:







// Обновление статуса заявки (AJAX)
app.post('/admin/update-status', isAdmin, async (req, res) => {
    try {
        const { ticketId, status } = req.body;
        const db = getDB();
        
        await db.run('UPDATE tickets SET status = ? WHERE id = ?', [status, ticketId]);
        res.json({ success: true });
        
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: err.message });
    }
});

// Просмотр конкретной заявки в админке
app.get('/admin/tickets/:id', isAdmin, async (req, res) => {
    try {
        const db = getDB();
        
        const ticket = await db.get(`
            SELECT 
                tickets.*,
                users.fio as user_fio,
                users.email as user_email,
                users.phone as user_phone
            FROM tickets 
            LEFT JOIN users ON tickets.user_id = users.id 
            WHERE tickets.id = ?
        `, [req.params.id]);
        
        if (!ticket) {
            return res.status(404).send('Заявка не найдена');
        }
        
        const messages = await db.all(
            'SELECT * FROM messages WHERE ticket_id = ? ORDER BY created_at ASC',
            [req.params.id]
        );
        
        res.render('admin/ticket-view', { ticket, messages });
        
    } catch (err) {
        console.error(err);
        res.send('Ошибка загрузки заявки');
    }
});





// ========== ЗАПУСК СЕРВЕРА ==========

async function startServer() {
    await initDB();
    
    const db = getDB();
    const adminExists = await db.get("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
    
    if (!adminExists) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await db.run(
            "INSERT INTO users (fio, email, phone, password, role) VALUES (?, ?, ?, ?, ?)",
            ['Администратор', 'admin@test.com', '+7 (900) 000-00-00', hashedPassword, 'admin']
        );
        console.log('✅ Администратор создан: admin@test.com / admin123');
    } else {
        console.log('✅ Администратор уже существует');
    }
    
    const PORT = process.env.PORT || 3000;  
    app.listen(PORT, () => {  
        console.log(`🚀 Сервер запущен на порту ${PORT}`);
        console.log(`📝 Вход для клиентов: зарегистрируйтесь или войдите`);
        console.log(`👑 Админ-панель: http://localhost:${PORT}/admin`);
        console.log(`   Логин: admin@test.com | Пароль: admin123`);
    });
}

// API маршрут для чата
app.post('/api/chat', async (req, res) => {
    // 1. Получаем сообщение от пользователя из тела запроса
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    }

    // Настраиваем заголовки для стриминга (реального времени)
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
});


startServer();