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
    res.locals.activePage = req.path; // req.path содержит текущий URL (например, '/' или '/services')
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

// Проверка прав специалиста или администратора (для работы с заявками)
function isStaff(req, res, next) {
    if (req.session.user && (req.session.user.role === 'specialist' || req.session.user.role === 'admin')) {
        next();
    } else {
        res.status(403).send('Доступ запрещен: Вы не являетесь сотрудником');
    }
}

// Проверка прав специалиста/техника
function isSpecialist(req, res, next) {
    if (req.session.user && (req.session.user.role === 'specialist' || req.session.user.role === 'admin')) {
        next();
    } else {
        res.redirect('/login');
    }
}


// Просмотр всех заявок в админ-панели
app.get('/admin/tickets', isAdmin, async (req, res) => {
    try {
        const db = getDB();
        
        // Получаем все заявки с сортировкой: сначала аварийные/срочные, затем по дате
        const tickets = await db.all(`
            SELECT tickets.*, users.fio as client_fio 
            FROM tickets 
            LEFT JOIN users ON tickets.user_id = users.id
            ORDER BY 
                CASE urgency 
                    WHEN 'emergency' THEN 1 
                    WHEN 'urgent' THEN 2 
                    ELSE 3 
                END,
                tickets.created_at DESC
        `);

        // Отображаем шаблон (предполагается, что файл лежит в views/admin/tickets.ejs)
        res.render('admin/tickets', { 
            tickets: tickets,
            error: null 
        });
    } catch (error) {
        console.error('Ошибка при загрузке заявок в админке:', error);
        res.status(500).send('Внутренняя ошибка сервера');
    }
});

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



// Страница списка всех заявок
app.get('/admin/tickets', isAdmin, async (req, res) => {
    const db = getDB();
    const tickets = await db.all("SELECT * FROM tickets ORDER BY created_at DESC");
    // Рендерим файл tickets.ejs из папки views/admin
    res.render('admin/tickets', { tickets, activePage: 'tickets' }); 
});

// Страница пользователей
app.get('/admin/users', isAdmin, async (req, res) => {
    const db = getDB();
    const users = await db.all("SELECT * FROM users WHERE role = 'user'");
    res.render('admin/users', { users, activePage: 'users' });
});


// Страница отчетов
app.get('/admin/reports', isAdmin, async (req, res) => {
    // Твой код для подсчета KPI
    res.render('admin/reports', { activePage: 'reports' });
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

        // Записываем данные в сессию
        req.session.user = { id: user.id, fio: user.fio, role: user.role, email: user.email };

        // Принудительно сохраняем сессию перед редиректом, чтобы данные точно записались в базу/память
        req.session.save((err) => {
            if (err) {
                console.error('Ошибка сохранения сессии:', err);
                return res.render('login', { error: 'Ошибка авторизации' });
            }

            // Перенаправляем пользователя строго ОДИН раз в зависимости от роли
            if (user.role === 'admin') {
                return res.redirect('/admin');
            } else if (user.role === 'specialist') {
                return res.redirect('/specialist');
            } else {
                return res.redirect('/dashboard'); // Для обычных клиентов
            }
        });

    } catch (err) {
        console.error(err);
        // Проверяем, не ушли ли заголовки, чтобы избежать падения при непредвиденной ошибке
        if (!res.headersSent) {
            res.render('login', { error: 'Ошибка сервера' });
        }
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Ошибка при закрытии сессии:', err);
            return res.status(500).send('Не удалось выйти из системы');
        }
        // Очищаем куку сессии на клиенте
        res.clearCookie('connect.sid'); 
        // Перенаправляем на главную страницу или страницу входа
        res.redirect('/login'); 
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

// ================= ЛОГИКА СПЕЦИАЛИСТА =================

// 1. Главная панель специалиста
app.get('/specialist', isSpecialist, async (req, res) => {
    try {
        const db = getDB();
        
        // Находим ID специалиста по id авторизованного пользователя
        const specialist = await db.get("SELECT id FROM specialists WHERE user_id = ?", [req.session.user.id]);
        
        if (!specialist) {
            return res.status(403).send("Вы зарегистрированы как пользователь, но не внесены в реестр специалистов.");
        }

        // Получаем все задачи этого специалиста из расписания
        const tasks = await db.all(`
            SELECT 
                t.id, t.subject, t.address, t.status, t.urgency, t.created_at,
                sc.date as scheduled_date, sc.time_slot
            FROM schedule sc
            INNER JOIN tickets t ON sc.ticket_id = t.id
            WHERE sc.specialist_id = ?
            ORDER BY sc.date DESC, sc.time_slot ASC
        `, [specialist.id]);

        // Группируем для статистики на дашборде
        const stats = {
            active: tasks.filter(t => t.status !== 'Выполнено' && t.status !== 'Закрыта').length,
            completed: tasks.filter(t => t.status === 'Выполнено').length,
            emergency: tasks.filter(t => t.urgency === 'emergency' && t.status !== 'Выполнено').length
        };

        res.render('specialist/dashboard', { tasks, stats });
    } catch (err) {
        console.error(err);
        res.status(500).send("Ошибка загрузки панели техника");
    }
});


// API для получения списка забронированных дат
app.get('/api/booked-dates', async (req, res) => {
    try {
        const db = getDB();
        // Выбираем только уникальные даты активных заявок (исключая отмененные, если нужно)
        const rows = await db.all(`
            SELECT DISTINCT booking_date 
            FROM tickets 
            WHERE booking_date IS NOT NULL AND status != 'Отклонена'
        `);
        
        // Превращаем массив объектов [{booking_date: '2026-06-10'}] в массив строк ['2026-06-10']
        const bookedDates = rows.map(row => row.booking_date);
        
        res.json(bookedDates);
    } catch (error) {
        console.error('Ошибка при получении забронированных дат:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});


// 2. Просмотр заявки техником
app.get('/specialist/tickets/:id', isSpecialist, async (req, res) => {
    try {
        const db = getDB();
        const ticketId = req.params.id;

        // Получаем данные заявки и дату выезда
        const ticket = await db.get(`
            SELECT t.*, sc.date as scheduled_date, sc.time_slot
            FROM tickets t
            LEFT JOIN schedule sc ON sc.ticket_id = t.id
            WHERE t.id = ?
        `, [ticketId]);

        if (!ticket) return res.status(404).send("Заявка не найдена");

        res.render('specialist/ticket-view', { ticket });
    } catch (err) {
        console.error(err);
        res.status(500).send("Ошибка сервера");
    }
});

// 3. Изменение статуса и добавление отчета техником
app.post('/specialist/tickets/:id/status', isSpecialist, async (req, res) => {
    try {
        const db = getDB();
        const { status, work_report } = req.body;
        const ticketId = req.params.id;

        // Обновляем статус и текст выполненных работ (если передан отчет)
        // Примечание: если в таблице tickets еще нет поля work_report, SQLite запишет это без ошибок, 
        // но лучше добавить COLUMN work_report TEXT в таблицу tickets, чтобы сохранять отчеты мастеров.
        await db.run(`
            UPDATE tickets 
            SET status = ?, description = description || '\n[Отчет мастера]: ' || ?
            WHERE id = ?
        `, [status, work_report || 'Статус обновлен', ticketId]);

        res.redirect(`/specialist/tickets/${ticketId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Не удалось обновить статус");
    }
});

app.post('/tickets/create', async (req, res) => {
    try {
        const db = getDB();
        
        // Получаем данные из формы, включая новую дату визита
        const { title, company, gate_type, description, priority, time_slot, address, phone, booking_date } = req.body;
        const userId = req.session.user ? req.session.user.id : null; // Или как у вас реализовано

        // Добавляем booking_date в поля и в VALUES
        await db.run(`
            INSERT INTO tickets (user_id, title, company, gate_type, description, priority, time_slot, address, phone, status, booking_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            userId, 
            title, 
            company, 
            gate_type, 
            description, 
            priority, 
            time_slot, 
            address, 
            phone, 
            'Новая', 
            booking_date || null // Если дата не выбрана, запишется null
        ]);

        res.redirect('/dashboard'); // Или ваш редирект после успеха
    } catch (error) {
        console.error('Ошибка при создании заявки:', error);
        res.status(500).send('Внутренняя ошибка сервера');
    }
});

// ========== АДМИН-ПАНЕЛЬ ==========

// Панель управления администратора (Главная страница админки)
app.get('/admin', isAdmin, async (req, res) => {
    try {
        const db = getDB(); // Получаем экземпляр подключения к БД

        // Параллельно или последовательно собираем данные для счетчиков
        const totalTicketsRes = await db.get("SELECT COUNT(*) as count FROM tickets");
        const newTicketsRes = await db.get("SELECT COUNT(*) as count FROM tickets WHERE status = 'new' OR status = 'Новая'");
        const processingTicketsRes = await db.get("SELECT COUNT(*) as count FROM tickets WHERE status = 'processing' OR status = 'В обработке'");
        const completedTicketsRes = await db.get("SELECT COUNT(*) as count FROM tickets WHERE status = 'done' OR status = 'Завершено'");
        const emergencyTicketsRes = await db.get("SELECT COUNT(*) as count FROM tickets WHERE urgency = 'emergency'");
        const totalUsersRes = await db.get("SELECT COUNT(*) as count FROM users WHERE role = 'user'");
        const todayTicketsRes = await db.get("SELECT COUNT(*) as count FROM tickets WHERE date(created_at) = date('now', 'localtime')");

        // Формируем объект stats со всеми полями, которые запрашивает admin/index.ejs
        const stats = {
            totalTickets: totalTicketsRes?.count || 0,
            newTickets: newTicketsRes?.count || 0,
            processingTickets: processingTicketsRes?.count || 0,
            completedTickets: completedTicketsRes?.count || 0,
            emergencyTickets: emergencyTicketsRes?.count || 0,
            totalUsers: totalUsersRes?.count || 0,
            todayTickets: todayTicketsRes?.count || 0
        };

        // Рендерим шаблон и передаем туда stats и активную страницу для подсветки в sidebar
        res.render('admin/index', { 
            stats: stats, 
            activePage: 'dashboard' 
        });

    } catch (err) {
        console.error('Ошибка при загрузке главной страницы админки:', err);
        res.status(500).send('Ошибка сервера при формировании статистики панели управления');
    }
});
// 1. Получение занятых слотов конкретного специалиста для FullCalendar
app.get('/api/admin/specialist-events', isAdmin, async (req, res) => {
    try {
        const { specialist_id } = req.query;
        if (!specialist_id) return res.json([]);
        
        const db = getDB();
        
        // Выбираем только забронированные слоты этого мастера
        const bookings = await db.all(`
            SELECT sc.date, sc.time_slot, t.id as ticket_id, t.subject
            FROM schedule sc
            LEFT JOIN tickets t ON sc.ticket_id = t.id
            WHERE sc.specialist_id = ? AND sc.is_booked = 1
        `, [specialist_id]);
        
        // Преобразуем данные в формат событий FullCalendar
        const events = bookings.map(b => {
            // b.date имеет формат YYYY-MM-DD, b.time_slot — HH:MM
            const startDateTime = `${b.date}T${b.time_slot}:00`;
            
            // Считаем, что один слот длится 1 час для визуализации в сетке
            const hour = parseInt(b.time_slot.split(':')[0]);
            const nextHour = String(hour + 1).padStart(2, '0');
            const endDateTime = `${b.date}T${nextHour}:00`;
            
            return {
                id: b.ticket_id,
                title: `Заявка №${b.ticket_id}: ${b.subject}`,
                start: startDateTime,
                end: endDateTime,
                color: '#e31b23', // Фирменный красный цвет для занятых слотов
                allDay: false
            };
        });
        
        res.json(events);
    } catch (err) {
        console.error('Ошибка получения событий календаря:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
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


// Страница календаря / расписания специалистов
// Страница общего календаря / расписания специалистов
app.get('/admin/calendar', isAdmin, async (req, res) => {
    try {
        const db = getDB();

        // 1. Получаем список всех специалистов с их именами для фильтра/выбора в календаре
        const specialists = await db.all(`
            SELECT s.id, u.fio 
            FROM specialists s
            JOIN users u ON s.user_id = u.id
            ORDER BY u.fio ASC
        `);

        // 2. Получаем забронированные слоты из таблицы schedule, связывая их с заявками и мастерами
        const tasks = await db.all(`
            SELECT 
                t.id, 
                t.subject as title, 
                t.address, 
                t.status, 
                t.urgency, 
                sc.date as scheduled_date,
                sc.time_slot,
                u.fio as specialist_name,
                s.id as specialist_id
            FROM schedule sc
            INNER JOIN tickets t ON sc.ticket_id = t.id
            INNER JOIN specialists s ON sc.specialist_id = s.id
            INNER JOIN users u ON s.user_id = u.id
            WHERE sc.is_booked = 1
        `);

        // Рендерим страницу расписания
        res.render('admin/calendar', {
            specialists,
            tasksJson: JSON.stringify(tasks), 
            activePage: 'schedule'
        });

    } catch (err) {
        console.error('Ошибка при генерации календаря:', err);
        res.status(500).send('Ошибка сервера при загрузке календаря');
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
        
        // Передаем специалистов и активную страницу для подсветки меню
        res.render('admin/specialists', { specialists, activePage: 'specialists' });
    } catch (err) {
        console.error('Ошибка загрузки специалистов:', err);
        res.status(500).send('Ошибка загрузки специалистов');
    }
});

// Добавление специалиста
app.post('/admin/specialists/add', isAdmin, async (req, res) => {
    try {
        const { fio, email, phone, password, specialization } = req.body;
        const db = getDB();

        // 1. Проверяем, нет ли уже пользователя с таким email
        const existingUser = await db.get('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUser) {
            return res.status(400).send('Пользователь с таким email уже зарегистрирован');
        }

        // Хешируем пароль
        const hashedPassword = await bcrypt.hash(password, 10);

        // 2. ПЕРВЫЙ ЗАПРОС: Создаем пользователя в таблице users со специальной ролью
        const userResult = await db.run(`
            INSERT INTO users (fio, email, phone, password, role) 
            VALUES (?, ?, ?, ?, 'specialist')
        `, [fio, email, phone, hashedPassword]);

        // Получаем ID только что созданного пользователя в базе данных
        const newUserId = userResult.lastID;

        // 3. ВТОРОЙ ЗАПРОС: Создаем запись в таблице specialists, привязывая её к newUserId
        // Также задаем начальный рейтинг (например, 5.0)
        await db.run(`
            INSERT INTO specialists (user_id, specialization, rating) 
            VALUES (?, ?, 5.0)
        `, [newUserId, specialization || 'Общий профиль']);

        // Успешно создано -> редирект обратно на список
        res.redirect('/admin/specialists');

    } catch (err) {
        console.error('Ошибка при создании специалиста:', err);
        res.status(500).send('Внутренняя ошибка сервера');
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

app.get('/admin/reports', isAdmin, async (req, res) => {
    // ПРИНУДИТЕЛЬНЫЙ ВЫВОД В КОНСОЛЬ, ЧТОБЫ УВИДЕТЬ, РАБОТАЕТ ЛИ ЭТОТ КОД
    console.log("!!! ЗАГРУЗКА ОТЧЕТОВ РАБОТАЕТ !!!");

    try {
        const db = getDB();
        
        // Получаем данные
        const tickets = await db.all(`SELECT * FROM tickets`);
        const statusStats = await db.all(`SELECT status, COUNT(*) as count FROM tickets GROUP BY status`);
        const specialistStats = await db.all(`
            SELECT u.fio, COUNT(t.id) as task_count
            FROM users u
            LEFT JOIN tickets t ON u.id = t.specialist_id
            WHERE u.role = 'specialist'
            GROUP BY u.id
        `);

        // Обязательно передаем объект с данными
        res.render('admin/reports', { 
            stats: { totalTickets: tickets.length }, // упрощенно для теста
            statusStats: statusStats || [],
            specialistStats: specialistStats || [],
            user: req.session.user 
        });
        
    } catch (err) {
        console.error('КРИТИЧЕСКАЯ ОШИБКА:', err);
        res.status(500).send('Ошибка: ' + err.message);
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
        
        const specialists = await db.all(`
            SELECT id, fio FROM users WHERE role = 'specialist'
        `);

        // 3. Передаем в EJS-шаблон и саму заявку (ticket), и массив мастеров (specialists)
        res.render('admin/ticket-view', { 
            ticket, 
            specialists 
        });

    } catch (err) {
        console.error('Ошибка при загрузке страницы заявки для админа:', err);
        res.status(500).send('Внутренняя ошибка сервера');
    }
});


const viewRoutes = require('./routes/viewRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
app.use('/api/tickets', ticketRoutes);
app.use('/', viewRoutes);

// ========== ЗАПУСК СЕРВЕРА ========== 676767

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