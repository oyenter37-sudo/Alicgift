const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;

const pool = new Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const action = req.query.action || req.body?.action;

  try {
    if (action === 'getConfig') {
      const { rows } = await pool.query('SELECT key, value FROM config');
      const configMap = {};
      rows.forEach(r => configMap[r.key] = r.value);
      return res.status(200).json({ success: true, config: configMap });
    }

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

    if (action === 'sendMessage' && req.method === 'POST') {
      const { text } = req.body;
      await pool.query('INSERT INTO messages (text) VALUES ($1)', [text]);
      return res.status(200).json({ success: true });
    }

    // [НОВОЕ: Сохранение рисунка]
    if (action === 'saveDrawing' && req.method === 'POST') {
      const { pathData } = req.body;
      await pool.query('INSERT INTO drawings (path_data) VALUES ($1)', [pathData]);
      return res.status(200).json({ success: true });
    }

    if (action === 'logAction' && req.method === 'POST') {
      const { event } = req.body;
      await pool.query('INSERT INTO analytics (action) VALUES ($1)', [event]);
      return res.status(200).json({ success: true });
    }

    if (action === 'getAdminData') {
      const messages = await pool.query('SELECT text, created_at FROM messages ORDER BY id DESC');
      const logs = await pool.query('SELECT action, created_at FROM analytics ORDER BY id DESC LIMIT 50');
      const conf = await pool.query('SELECT key, value FROM config');
      const drw = await pool.query('SELECT path_data, created_at FROM drawings ORDER BY id DESC LIMIT 10');
      
      const configMap = {};
      conf.rows.forEach(r => configMap[r.key] = r.value);
      
      return res.status(200).json({
        success: true,
        messages: messages.rows,
        logs: logs.rows,
        config: configMap,
        drawings: drw.rows // [НОВОЕ: Передача рисунков в админку]
      });
    }

    return res.status(404).json({ error: 'Action not found' });
  } catch (err) {
    console.error('DB Error:', err);
    return res.status(500).json({ error: 'Database Error', details: err.message });
  }
}
