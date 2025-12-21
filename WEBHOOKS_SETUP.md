# Helius Webhooks Setup

## Що таке Webhooks?

Webhooks від Helius дозволяють отримувати транзакції в **реальному часі** без постійного опитування API (polling).

### Переваги:
- ✅ **Мінімальна затримка**: 50-200ms замість 200-1000ms
- ✅ **Менше викликів API**: 0 polling викликів
- ✅ **Економія ресурсів**: немає постійних запитів кожні 200мс
- ✅ **Масштабованість**: Helius відправляє дані одразу при виявленні транзакції

## Налаштування

### 1. Встановіть публічний URL для webhook endpoint
```env
# .env.local
WEBHOOK_URL=https://your-domain.vercel.app/api/webhook
```

### 2. Створіть webhook через Helius Dashboard або CLI

**Через Dashboard:**
1. Відкрийте https://dashboard.helius.dev/webhooks
2. Create Webhook → Enhanced Transactions
3. Додайте URL: `https://your-domain.vercel.app/api/webhook`
4. Виберіть типи: `SWAP`, `TRANSFER`
5. Додайте адреси токенів для моніторингу

**Через CLI:**
```bash
# Створити webhook
npm run webhook create <TOKEN_ADDRESS>

# Показати всі webhooks
npm run webhook list

# Видалити webhook
npm run webhook delete <WEBHOOK_ID>
```

### 3. Перевірте роботу

Після налаштування:
1. Запустіть моніторинг токена
2. У консолі браузера ви побачите `_source: 'webhook'` для транзакцій від webhook
3. `_source: 'polling'` для транзакцій з резервного polling

## Гібридний режим

Система використовує **гібридний підхід**:

1. **Webhooks (пріоритет 1)**: Миттєва доставка через webhook endpoint
2. **Adaptive Polling (резерв)**: 
   - Початковий інтервал: 2 секунди
   - При активності: зменшується до 500мс
   - При відсутності активності: збільшується до 10 секунд

### Адаптивний polling

```typescript
// Початок: 2000мс (консервативно)
// Активність виявлена → 500мс (швидкий моніторинг)
// 3 порожні запити → +1000мс (повільніше)
// 30сек без активності → 10000мс (дуже рідко)
```

## Моніторинг

Перевірте логи в консолі:
```
⏱️ Latency: API 150ms | Parse 5ms | Total 155ms (_source: webhook)
📊 Polling interval adjusted to 500ms for So111111...
```

## Обмеження

### Free tier Helius:
- 1 активний webhook
- До 100 адрес на webhook

### Paid tiers:
- Більше webhooks
- Більше адрес
- Вища надійність

## Troubleshooting

**Webhook не працює?**
1. Перевірте, що URL публічний (не localhost)
2. Endpoint повертає 200 OK
3. Перевірте логи Helius Dashboard
4. Fallback polling все одно працює

**Дублювання транзакцій?**
- Код автоматично видаляє дублікати за signature
- Можливі дублікати між webhook і polling (це нормально)
