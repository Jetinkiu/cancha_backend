const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// conexión de prueba
(async () => {
  try {
    const client = await pool.connect();
    console.log("✅ Conectado a la base de datos");
    client.release();
  } catch (err) {
    console.error("❌ Error al conectar a la base de datos:", err.message);
  }
})();

pool.on("error", (err) => {
  console.error("Error en la conexión a la base de datos:", err.message);
});

module.exports = pool;