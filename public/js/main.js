document.addEventListener('DOMContentLoaded', () => {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                // Если хочешь, чтобы анимация срабатывала только один раз:
                observer.unobserve(entry.target);
            }
        });
    }, { 
        threshold: 0.1, // Сработает, когда 10% элемента появится на экране
        rootMargin: "0px 0px -50px 0px" // Немного смещаем границу срабатывания вверх
    });

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

        // Функция для запуска счетчиков
    const startCounters = () => {
        const counters = document.querySelectorAll('.stat-number');
        const speed = 200; // Чем выше число, тем медленнее анимация

        counters.forEach(counter => {
            const updateCount = () => {
                const target = +counter.getAttribute('data-target');
                const count = +counter.innerText;
                const inc = target / speed;

                if (count < target) {
                    counter.innerText = Math.ceil(count + inc);
                    setTimeout(updateCount, 15);
                } else {
                    counter.innerText = target + (counter.getAttribute('data-target') === '100' ? '%' : '+');
                }
            };
            updateCount();
        });
    };

    // Модифицируем наш существующий Observer, чтобы он запускал счетчик один раз
    const statsSection = document.querySelector('#stats');
    if (statsSection) {
        const statsObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                startCounters();
                statsObserver.unobserve(statsSection); // Запускаем только один раз
            }
        }, { threshold: 0.5 });

        statsObserver.observe(statsSection);
    }


    const initMap = () => {
        const mapContainer = document.getElementById('map');
        if (!mapContainer) return;

        // 1. Отключаем attributionControl (убирает надпись Leaflet | OpenStreetMap)
        const map = L.map('map', {
            attributionControl: false,
            zoomControl: true // Оставляем только кнопки +/-
        }).setView([51.7666, 55.1005], 12);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

        // 2. Создаем свой маркер (Красный круг в стиле холдинга), 
        // чтобы не грузить стандартные синие иконки
        const customIcon = L.divIcon({
            className: 'custom-div-icon',
            html: `<div style="background-color: #E30613; width: 15px; height: 15px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.5);"></div>`,
            iconSize: [15, 15],
            iconAnchor: [7, 7]
        });

        const locations = [
            {
                coords: [51.785, 55.120],
                title: "Логистический центр",
                desc: "Установка 12 промышленных секционных ворот Alutech ProTrend.",
                img: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=300"
            },
            {
                coords: [51.730, 55.100],
                title: "ЖК «Времена года»",
                desc: "Монтаж скоростных шлагбаумов CAME с системой распознавания номеров.",
                img: "https://images.unsplash.com/photo-1590477922240-6dc84f676239?q=80&w=300"
            },
            {
                coords: [51.760, 55.150],
                title: "Частный сектор (п. Ростоши)",
                desc: "Гаражные ворота Prestige с индивидуальным дизайном под дерево.",
                img: "https://images.unsplash.com/photo-1516934024742-b461fbc4760e?q=80&w=300"
            }
        ];

        locations.forEach(loc => {
            // Добавляем маркер с нашей иконкой
            const marker = L.marker(loc.coords, { icon: customIcon }).addTo(map);
            
            const popupContent = `
                <div style="width: 200px; font-family: 'Montserrat', sans-serif; padding: 5px;">
                    <img src="${loc.img}" style="width: 100%; border-radius: 4px; margin-bottom: 10px;">
                    <h4 style="margin: 0 0 5px 0; color: #E30613; font-weight: 900; text-transform: uppercase; font-size: 14px;">${loc.title}</h4>
                    <p style="margin: 0; font-size: 12px; color: #333; line-height: 1.4;">${loc.desc}</p>
                </div>
            `;
            
            marker.bindPopup(popupContent);
        });
    };

    // Запуск инициализации
    initMap();
});

document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelectorAll('.tab-btn');
    const cards = document.querySelectorAll('.price-card');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // 1. Управляем активным классом кнопки
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const filter = tab.getAttribute('data-filter');

            // 2. Фильтруем карточки
            cards.forEach(card => {
                const category = card.getAttribute('data-category');
                
                if (filter === 'all' || category === filter) {
                    card.classList.remove('hidden');
                    card.classList.add('show');
                } else {
                    card.classList.remove('show');
                    card.classList.add('hidden');
                }
            });
        });
    });
});


document.addEventListener('DOMContentLoaded', () => {
    const slider = document.getElementById('compare-slider');
    const foregroundImg = document.querySelector('.foreground-img');
    const sliderLine = document.querySelector('.slider-line');
    const sliderBtn = document.querySelector('.slider-button');

    if (slider) {
        slider.addEventListener('input', (e) => {
            const sliderValue = e.target.value;
            
            // Меняем ширину верхнего слоя
            foregroundImg.style.width = `${sliderValue}%`;
            
            // Двигаем линию и кнопку
            sliderLine.style.left = `${sliderValue}%`;
            sliderBtn.style.left = `${sliderValue}%`;
        });
    }
});

function openSosModal() {
    const confirmSos = confirm("Вызвать мастера на последний объект? Мы свяжемся с вами в течение 5 минут.");
    if (confirmSos) {
        // Здесь будет твой запрос к API для создания экстренного тикета
        alert("Заявка SOS принята! Мастер уже уведомлен.");
    }
}


function nextStep(step) {
    // Скрываем все шаги
    document.querySelectorAll('.form-step').forEach(s => s.style.display = 'none');
    
    // Показываем нужный
    document.getElementById('step' + step).style.display = 'block';

    // Обновляем прогресс-бар
    const progress = (step - 1) / 2 * 100;
    document.getElementById('progressLine').style.width = progress + '%';

    // Обновляем активные кружки
    document.querySelectorAll('.step-circle').forEach(circle => {
        if (circle.getAttribute('data-step') <= step) {
            circle.classList.add('active');
        } else {
            circle.classList.remove('active');
        }
    });
}

function updateStatus(ticketId, newStatus) {
    fetch('/admin/tickets/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ticketId, status: newStatus })
    })
    .then(response => response.json())
    .then(data => {
        if(data.success) {
            console.log('Статус обновлен');
            // Можно добавить уведомление (toast)
        }
    });
}

document.addEventListener('keydown', function(e) {
    // Alt + Shift + A
    if (e.altKey && e.shiftKey && e.code === 'KeyA') {
        const secretUrlPart = prompt("SYSTEM ACCESS: Enter Secret URL Key");
        if (secretUrlPart) {
            // Перенаправляем на секретный вход, который мы создали в app.js
            window.location.href = `/admin-login/${secretUrlPart}`;
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const chatToggle = document.getElementById('chat-toggle');
    const chatWindow = document.getElementById('chat-window');
    const chatClose = document.getElementById('chat-close');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');

    // Функция для добавления сообщения в окно чата
    function addMessage(text, isUser = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user-msg' : 'ai-msg'}`;
        messageDiv.innerHTML = text.replace(/\n/g, '<br>');
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return messageDiv;
    }

    // Показ индикатора "печатает"
    function showTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'message ai-msg typing-indicator';
        indicator.id = 'typing-indicator';
        indicator.innerHTML = '<span></span><span></span><span></span>';
        chatMessages.appendChild(indicator);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }

    // Отправка сообщения на сервер
    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) return;

        // Очищаем поле ввода и показываем сообщение пользователя
        chatInput.value = '';
        addMessage(message, true);

        // Показываем индикатор загрузки ответа
        showTypingIndicator();

        try {
            // Отправляем POST-запрос на наш бэкенд
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message })
            });

            if (!response.ok) throw new Error('Network response was not ok');
            if (!response.body) throw new Error('ReadableStream not supported');

            // Убираем индикатор, так как начинаем получать реальный ответ
            hideTypingIndicator();

            // Создаем пустой блок для ответа ассистента
            const assistantMessageDiv = addMessage('', false);
            let fullResponse = '';

            // Читаем потоковый ответ от сервера
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                fullResponse += chunk;
                // Обновляем содержимое сообщения в реальном времени
                assistantMessageDiv.innerHTML = fullResponse.replace(/\n/g, '<br>');
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }

        } catch (error) {
            console.error('Ошибка:', error);
            hideTypingIndicator();
            addMessage('Извините, произошла ошибка соединения. Убедитесь, что сервер запущен.', false);
        }
    }

    // Обработчики событий
    chatSend.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    chatToggle.addEventListener('click', () => {
        chatWindow.style.display = chatWindow.style.display === 'flex' ? 'none' : 'flex';
    });
    chatClose.addEventListener('click', () => {
        chatWindow.style.display = 'none';
    });
});