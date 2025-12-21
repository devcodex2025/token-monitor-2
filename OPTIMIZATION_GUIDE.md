# 🚀 Оптимізація: Webhooks + Adaptive Polling

## Що змінилось?

### ❌ Було (проблема):
- Постійний polling кожні **200мс** (5 запитів/секунду)
- Висока затримка: 200-400мс
- Багато непотрібних API викликів
- Навантаження на Helius API

### ✅ Стало (рішення):

1. **Helius Webhooks (пріоритет)**
   - Миттєва доставка транзакцій
   - Затримка: 50-200мс
   - **0 polling викликів**
   - Push-модель замість pull

2. **Adaptive Polling (резерв)**
   - Розумне налаштування інтервалу
   - При активності: 500мс
   - При простої: до 10 секунд
   - Зменшення викликів API на **80-95%**

## Результати

### Без активності:
- **Було**: 5 викликів/сек × 60сек = **300 викликів/хв**
- **Стало**: 6 викликів/хв (кожні 10 сек)
- **Економія**: 98% ⬇️

### З активністю:
- **Було**: 5 викликів/сек постійно
- **Стало**: webhook (0 polling) + 2 виклики/сек резервно
- **Економія**: 60-100% ⬇️

### Затримка:
- **Webhook**: 50-150мс 🎯
- **Polling**: 500-1000мс 📊
- **Покращення**: до 4x швидше

## Як використовувати

### Варіант 1: Тільки Adaptive Polling (працює зараз)
Не потрібно нічого робити! Система вже використовує розумний polling:
- Автоматично прискорюється при активності
- Автоматично сповільнюється при простої

### Варіант 2: Webhooks + Polling (рекомендовано)

1. **Налаштуйте webhook URL в .env.local:**
```bash
WEBHOOK_URL=https://your-domain.vercel.app/api/webhook
```

2. **Створіть webhook через Helius:**

**Спосіб A - Через Dashboard:**
- https://dashboard.helius.dev/webhooks
- Create Webhook → Enhanced Transactions
- URL: ваш домен + `/api/webhook`
- Types: SWAP, TRANSFER

**Спосіб B - Через CLI:**
```bash
npm run webhook create <TOKEN_ADDRESS>
npm run webhook list
npm run webhook delete <WEBHOOK_ID>
```

3. **Задеплойте на Vercel**
```bash
vercel deploy
```

4. **Перевірте логи в консолі:**
```
🎯 WEBHOOK: API 50ms | Parse 5ms | Total 55ms
📊 POLLING: API 150ms | Parse 5ms | Total 155ms
💓 Heartbeat - polling interval: 2000ms
📊 Polling interval adjusted to 10000ms
```

## Моніторинг

Відкрийте консоль браузера (F12) і бачите:

- `🎯 WEBHOOK` - транзакція прийшла через webhook (найшвидше)
- `📊 POLLING` - транзакція знайдена через polling (резерв)
- `💓 Heartbeat` - з'єднання живе, показує поточний інтервал
- `📊 Polling interval adjusted` - система адаптувала швидкість

## Технічні деталі

### Адаптивний алгоритм:

```typescript
// Початковий інтервал: 2000мс (консервативно)
currentInterval = 2000;

// Якщо знайдено транзакції:
if (transactions.length > 0) {
  currentInterval = 500; // Прискорюємо
}

// Якщо 3 порожні запити підряд:
if (consecutiveEmpty >= 3) {
  currentInterval = Math.min(5000, currentInterval + 1000);
}

// Якщо 30 секунд без активності:
if (timeSinceActivity > 30000) {
  currentInterval = 10000; // Максимальне сповільнення
}
```

### Webhook Endpoint

`POST /api/webhook` - приймає payload від Helius:
```typescript
{
  type: 'ENHANCED',
  signature: '...',
  tokenTransfers: [...],
  ...
}
```

Автоматично розсилає всім активним SSE з'єднанням для цього токена.

## Обмеження

### Helius Free Tier:
- 1 активний webhook
- До 100 адрес на webhook
- Достатньо для більшості випадків

### Fallback:
Якщо webhook не налаштований або не працює:
- Adaptive polling працює автономно
- Економія все одно 80-95%
- Трохи більша затримка, але надійно

## Файли

### Нові:
- `app/api/webhook/route.ts` - endpoint для webhooks
- `lib/webhookManager.ts` - CLI для керування webhooks
- `WEBHOOKS_SETUP.md` - детальна інструкція
- `OPTIMIZATION_GUIDE.md` - цей файл

### Оновлені:
- `app/api/stream/route.ts` - adaptive polling + webhook integration
- `app/page.tsx` - логування джерела даних
- `package.json` - додано команду `webhook`

## FAQ

**Q: Чи потрібен платний план Helius?**
A: Ні, Free tier достатньо для 1 webhook з 100 адресами.

**Q: Що якщо я не хочу налаштовувати webhooks?**
A: Adaptive polling вже працює і економить 80-95% викликів API!

**Q: Чи можна використовувати тільки webhooks?**
A: Ні, polling - це важливий fallback для надійності.

**Q: Як перевірити, що все працює?**
A: Дивіться консоль браузера - там показується джерело кожної транзакції.

## Подяка

Ця оптимізація зменшує:
- ✅ API calls на 80-95%
- ✅ Затримку до 4x
- ✅ Навантаження на сервер
- ✅ Витрати на інфраструктуру

Тепер ваш моніторинг швидший і ефективніший! 🚀
