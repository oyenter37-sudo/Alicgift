// api/index.js - УЛЬТИМАТИВНЫЙ ФИКС
const { Pool } = require('pg');

// Пытаемся найти ЛЮБУЮ переменную, которую мог создать Vercel
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  throw new Error('FATAL: Нет переменной окружения для базы данных! Проверь Vercel Settings.');
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false // Важно для Neon!
  }
});

export default async function handler(req, res) {
  // CORS - Разрешаем всем (для тестов)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const action = req.query.action || req.body?.action;

  try {
    // Проверка соединения
    if (action === 'test') {
       const result = await pool.query('SELECT NOW()');
       return res.status(200).json({ success: true, time: result.rows[0] });
    }

    // 1. Получить конфиг
    if (action === 'getConfig') {
      const { rows } = await pool.query('SELECT key, value FROM config');
      const configMap = {};
      rows.forEach(r => configMap[r.key] = r.value);
      return res.status(200).json({ success: true, config: configMap });
    }

    // 2. Обновить конфиг
    if (action === 'updateConfig' && req.method === 'POST') {
      const { config } = req.body;
      for (const [key, value] of Object.entries(config)) {
        await pool.query(
          'INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
          [key, value]
        );
      }
      return res.status(200).json({ success: true });
    }

    // 3. Сохранить сообщение
    if (action === 'sendMessage' && req.method === 'POST') {
      const { text } = req.body;
      if (!text) return res.status(400).json({ error: 'Empty message' });
      await pool.query('INSERT INTO messages (text) VALUES ($1)', [text]);
      return res.status(200).json({ success: true });
    }

    // 4. Логи
    if (action === 'logAction' && req.method === 'POST') {
      const { event } = req.body;
      await pool.query('INSERT INTO analytics (action) VALUES ($1)', [event]);
      return res.status(200).json({ success: true });
    }

    // 5. Админка
    if (action === 'getAdminData') {
      const messages = await pool.query('SELECT text, created_at FROM messages ORDER BY id DESC');
      const logs = await pool.query('SELECT action, created_at FROM analytics ORDER BY id DESC LIMIT 50');
      const conf = await pool.query('SELECT key, value FROM config');
      const configMap = {};
      conf.rows.forEach(r => configMap[r.key] = r.value);
      
      return res.status(200).json({
        success: true,
        messages: messages.rows,
        logs: logs.rows,
        config: configMap
      });
    }

    return res.status(404).json({ error: 'Action not found' });
  } catch (err) {
    console.error('DB Error:', err);
    return res.status(500).json({ error: 'Database Connection Failed', details: err.message });
  }
}
