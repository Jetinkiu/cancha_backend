//cancha_backend/config/database.js
const { Pool } = require('pg');

const DB_NAME = process.env.DB_NAME || 'canchalic';

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: DB_NAME,
  password: process.env.DB_PASSWORD || '123123',
  port: process.env.DB_PORT || 5432,
});

// ✅ Hacer una conexión inicial de prueba
(async () => {
  try {
    const client = await pool.connect();
    console.log(`Conectado a la base de datos ${DB_NAME}`);
    client.release();
  } catch (err) {
    console.error('❌ Error al conectar a la base de datos:', err.stack);
  }
})();

pool.on('error', (err) => {
  console.error('Error en la conexión a la base de datos:', err.stack);
});

module.exports = pool;