const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

let db;

async function initDB() {
    db = await open({
        filename: './data/orenspecstroy.db',
        driver: sqlite3.Database
    });

    // Создаём таблицу users
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fio TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            phone TEXT,
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Создаём таблицу tickets (с новыми полями)
    await db.exec(`
        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            subject TEXT NOT NULL,
            description TEXT NOT NULL,
            equipment_type TEXT,
            model TEXT,
            urgency TEXT DEFAULT 'normal',
            preferred_time TEXT,
            address TEXT,
            phone TEXT,
            status TEXT DEFAULT 'new',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS knowledge_base (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            category TEXT,
            author_id INTEGER,
            views INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(author_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS services (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT,
            price INTEGER,
            unit TEXT,
            sort_order INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS specialists_schedule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            specialist_id INTEGER,
            date DATE,
            time_slot TEXT,
            is_booked BOOLEAN DEFAULT 0,
            ticket_id INTEGER,
            FOREIGN KEY(specialist_id) REFERENCES users(id)
        );
    `);
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS specialists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE,
            specialization TEXT,
            experience INTEGER,
            rating REAL DEFAULT 5.0,
            phone TEXT,
            is_active BOOLEAN DEFAULT 1,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS schedule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            specialist_id INTEGER,
            date DATE,
            time_slot TEXT,
            is_booked BOOLEAN DEFAULT 0,
            ticket_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(specialist_id) REFERENCES specialists(id),
            FOREIGN KEY(ticket_id) REFERENCES tickets(id)
        );

        CREATE TABLE IF NOT EXISTS time_slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slot_time TEXT,
            sort_order INTEGER
        );
    `);

    // Добавляем временные слоты
    const slotsCount = await db.get('SELECT COUNT(*) as count FROM time_slots');
    if (slotsCount.count === 0) {
        await db.run(`
            INSERT INTO time_slots (slot_time, sort_order) VALUES 
            ('09:00', 1), ('10:00', 2), ('11:00', 3),
            ('12:00', 4), ('13:00', 5), ('14:00', 6),
            ('15:00', 7), ('16:00', 8), ('17:00', 9),
            ('18:00', 10)
        `);
    }

    // Добавьте начальные услуги в прайс-лист
    const servicesCount = await db.get('SELECT COUNT(*) as count FROM services');
    if (servicesCount.count === 0) {
        await db.run(`INSERT INTO services (name, category, price, unit) VALUES 
            ('Выезд специалиста', 'Диагностика', 1500, 'выезд'),
            ('Диагностика шлагбаума', 'Диагностика', 2000, 'шт'),
            ('Ремонт привода Alutech', 'Ремонт', 5000, 'шт'),
            ('Настройка автоматики', 'Настройка', 3000, 'шт'),
            ('Замена пружины', 'Ремонт', 3500, 'шт'),
            ('Плановое ТО', 'Обслуживание', 2500, 'выезд')`);
    }

    // Миграция для существующей БД (добавляем колонки, если их нет)
    const columns = ['equipment_type', 'model', 'urgency', 'preferred_time', 'address', 'phone'];
    for (const col of columns) {
        try {
            await db.exec(`ALTER TABLE tickets ADD COLUMN ${col} TEXT`);
            console.log(`✅ Добавлена колонка: ${col}`);
        } catch(e) {
            // Колонка уже существует - игнорируем
        }
    }

    // Добавляем колонку completed_at, если её нет
    try {
        await db.exec(`ALTER TABLE tickets ADD COLUMN completed_at DATETIME`);
        console.log('✅ Добавлена колонка completed_at');
    } catch(e) {
        // колонка уже существует
    }

    console.log('✅ База данных готова');
    return db;
}

function getDB() {
    return db;
}

module.exports = { initDB, getDB };