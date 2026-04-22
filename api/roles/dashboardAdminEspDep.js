// dashboardAdminEspDep.js
const express = require('express');
const pool = require('../../config/database');
const router = express.Router();

// Función de respuesta estandarizada
const respuesta = (exito, mensaje, datos = null) => ({
  exito,
  mensaje,
  datos,
});

// ===================================================================
// MODELOS - Funciones puras para operaciones de base de datos
// ===================================================================

/**
 * 1. Resumen rápido (4 cards)
 */
const obtenerResumen = async (id_admin_esp_dep) => {
  const query = `
    WITH hoy AS (SELECT CURRENT_DATE AS fecha),
    espacios_admin AS (
      SELECT id_espacio 
      FROM ESPACIO_DEPORTIVO 
      WHERE id_admin_esp_dep = $1
    ),
    canchas_activas AS (
      SELECT COUNT(*) AS total 
      FROM CANCHA c
      JOIN espacios_admin ea ON c.id_espacio = ea.id_espacio
      WHERE c.estado = 'disponible' OR c.estado = 'ocupada'
    ),
    reservas_hoy AS (
      SELECT 
        COUNT(DISTINCT r.id_reserva) AS total,
        COALESCE(SUM(r.monto_total), 0) AS ingresos
      FROM RESERVA r
      JOIN RESERVA_HORARIO rh ON r.id_reserva = rh.id_reserva
      JOIN espacios_admin ea ON r.id_cancha IN (
        SELECT id_cancha FROM CANCHA WHERE id_espacio = ea.id_espacio
      )
      WHERE rh.fecha = (SELECT fecha FROM hoy) 
        AND r.estado != 'cancelada'
    ),
    horas_disponibles AS (
      SELECT COALESCE(SUM(
        EXTRACT(HOUR FROM (e.horario_cierre - e.horario_apertura))
      ), 0) * (SELECT total FROM canchas_activas) AS total_horas
      FROM ESPACIO_DEPORTIVO e
      JOIN CANCHA c ON e.id_espacio = c.id_espacio
      JOIN espacios_admin ea ON e.id_espacio = ea.id_espacio
      WHERE c.estado != 'mantenimiento'
    ),
    horas_reservadas AS (
      SELECT COALESCE(SUM(
        EXTRACT(HOUR FROM (rh.hora_fin - rh.hora_inicio))
      ), 0) AS horas
      FROM RESERVA_HORARIO rh
      JOIN RESERVA r ON rh.id_reserva = r.id_reserva
      JOIN espacios_admin ea ON r.id_cancha IN (
        SELECT id_cancha FROM CANCHA WHERE id_espacio = ea.id_espacio
      )
      WHERE rh.fecha = (SELECT fecha FROM hoy) 
        AND r.estado != 'cancelada'
    )
    SELECT 
      (SELECT total FROM canchas_activas) AS total_canchas,
      (SELECT total FROM reservas_hoy) AS reservas_hoy,
      (SELECT ingresos FROM reservas_hoy) AS ingresos_hoy,
      CASE 
        WHEN (SELECT total_horas FROM horas_disponibles) > 0 
        THEN ROUND(
          (SELECT horas FROM horas_reservadas)::numeric / 
          (SELECT total_horas FROM horas_disponibles) * 100, 0
        )
        ELSE 0 
      END AS ocupacion_porcentaje;
  `;
  const result = await pool.query(query, [id_admin_esp_dep]);
  return result.rows[0];
};

/**
 * 2. Últimas reservas (limit)
 */
const obtenerUltimasReservas = async (id_admin_esp_dep, limite = 3) => {
  const query = `
    SELECT 
      r.id_reserva,
      d.nombre AS disciplina,
      c.nombre AS cancha,
      rh.fecha,
      (rh.hora_inicio || ' - ' || rh.hora_fin) AS horario,
      (u.nombre || ' ' || u.apellido) AS cliente
    FROM RESERVA r
    JOIN RESERVA_HORARIO rh ON r.id_reserva = rh.id_reserva
    JOIN CANCHA c ON r.id_cancha = c.id_cancha
    JOIN ESPACIO_DEPORTIVO e ON c.id_espacio = e.id_espacio
    JOIN se_practica sp ON c.id_cancha = sp.id_cancha
    JOIN DISCIPLINA d ON sp.id_disciplina = d.id_disciplina
    JOIN ANFITRION a ON r.id_anfitrion = a.id_anfitrion
    JOIN CLIENTE cl ON a.id_anfitrion = cl.id_cliente
    JOIN USUARIO u ON cl.id_cliente = u.id_persona
    WHERE r.estado != 'cancelada'
      AND e.id_admin_esp_dep = $1
    ORDER BY rh.fecha DESC, rh.hora_inicio DESC
    LIMIT $2;
  `;
  const result = await pool.query(query, [id_admin_esp_dep, limite]);
  return result.rows;
};

/**
 * 3. Filtros rápidos (disciplinas)
 */
const obtenerDisciplinas = async (id_admin_esp_dep) => {
  const query = `
    SELECT DISTINCT d.id_disciplina, d.nombre 
    FROM DISCIPLINA d
    JOIN se_practica sp ON d.id_disciplina = sp.id_disciplina
    JOIN CANCHA c ON sp.id_cancha = c.id_cancha
    JOIN ESPACIO_DEPORTIVO e ON c.id_espacio = e.id_espacio
    WHERE e.id_admin_esp_dep = $1
    ORDER BY d.nombre;
  `;
  const result = await pool.query(query, [id_admin_esp_dep]);
  return result.rows;
};

/**
 * 4. Matriz de disponibilidad
 */
const obtenerMatrizDisponibilidad = async (id_admin_esp_dep, { fecha, hora_inicio, hora_fin, id_disciplina }) => {
  const params = [id_admin_esp_dep, fecha + ' ' + hora_inicio, fecha + ' ' + hora_fin, fecha];
  let whereClause = '';
  // CAMBIA esto: en lugar de "AND e.id_admin_esp_dep = $1" en el string
  // Debería ser parte del WHERE
  
  if (id_disciplina) {
    whereClause = `AND EXISTS (
      SELECT 1 FROM se_practica sp 
      WHERE sp.id_cancha = c.id_cancha AND sp.id_disciplina = $${params.length + 1}
    )`;
    params.push(id_disciplina);
  }

  const query = `
    WITH horarios AS (
      SELECT (generate_series(
        $2::timestamp,
        $3::timestamp,
        '1 hour'::interval
      ))::time AS hora
    ),
    canchas_filtradas AS (
      SELECT 
        c.id_cancha, c.nombre AS cancha_nombre, e.nombre AS espacio_nombre,
        e.horario_apertura, e.horario_cierre
      FROM CANCHA c
      JOIN ESPACIO_DEPORTIVO e ON c.id_espacio = e.id_espacio
      WHERE c.estado != 'mantenimiento' 
        AND e.id_admin_esp_dep = $1
        ${whereClause}
    ),
    reservas AS (
      SELECT rh.hora_inicio, rh.hora_fin, r.id_cancha
      FROM RESERVA_HORARIO rh
      JOIN RESERVA r ON rh.id_reserva = r.id_reserva
      WHERE rh.fecha = $4 AND r.estado != 'cancelada'
    )
    SELECT 
      cf.id_cancha, cf.espacio_nombre, cf.cancha_nombre,
      h.hora::text,
      CASE 
        WHEN rv.id_cancha IS NOT NULL THEN 'reservada'
        WHEN h.hora < cf.horario_apertura OR h.hora >= cf.horario_cierre THEN 'cerrado'
        ELSE 'disponible'
      END AS estado
    FROM canchas_filtradas cf
    CROSS JOIN horarios h
    LEFT JOIN reservas rv ON cf.id_cancha = rv.id_cancha
      AND h.hora >= rv.hora_inicio AND h.hora < rv.hora_fin
    ORDER BY cf.espacio_nombre, cf.cancha_nombre, h.hora;
  `;
  const result = await pool.query(query, params);
  return result.rows;
};

/**
 * 5. Canchas disponibles (horas libres)
 */
const obtenerCanchasDisponibles = async (id_admin_esp_dep, { id_disciplina, fecha, hora_inicio, hora_fin }) => {
  const params = [id_admin_esp_dep, fecha + ' ' + hora_inicio, fecha + ' ' + hora_fin, id_disciplina, fecha];
  const query = `
    WITH horarios AS (
      SELECT (generate_series(
        $2::timestamp,
        $3::timestamp,
        '1 hour'::interval
      ))::time AS hora
    ),
    canchas_validas AS (
      SELECT c.id_cancha, c.nombre, e.nombre AS espacio_nombre,
             e.horario_apertura, e.horario_cierre
      FROM CANCHA c
      JOIN ESPACIO_DEPORTIVO e ON c.id_espacio = e.id_espacio
      JOIN se_practica sp ON c.id_cancha = sp.id_cancha
      WHERE sp.id_disciplina = $4 
        AND c.estado != 'mantenimiento'
        AND e.id_admin_esp_dep = $1
    ),
    reservas AS (
      SELECT rh.hora_inicio, rh.hora_fin, r.id_cancha
      FROM RESERVA_HORARIO rh
      JOIN RESERVA r ON rh.id_reserva = r.id_reserva
      JOIN canchas_validas cv ON r.id_cancha = cv.id_cancha
      WHERE rh.fecha = $5 AND r.estado != 'cancelada'
    ),
    disponibilidad AS (
      SELECT cv.id_cancha, cv.nombre AS cancha_nombre, cv.espacio_nombre, h.hora,
             CASE WHEN rv.id_cancha IS NOT NULL THEN false ELSE true END AS libre
      FROM canchas_validas cv
      CROSS JOIN horarios h
      LEFT JOIN reservas rv ON cv.id_cancha = rv.id_cancha
        AND h.hora >= rv.hora_inicio AND h.hora < rv.hora_fin
      WHERE h.hora >= cv.horario_apertura AND h.hora < cv.horario_cierre
    )
    SELECT id_cancha, cancha_nombre, espacio_nombre,
           json_agg(hora::text ORDER BY hora) FILTER (WHERE libre) AS horas_libres
    FROM disponibilidad
    WHERE libre
    GROUP BY id_cancha, cancha_nombre, espacio_nombre
    ORDER BY espacio_nombre, cancha_nombre;
  `;
  const result = await pool.query(query, params);
  return result.rows;
};

/**
 * 6. Lista de reservas con paginación y filtros - VERSIÓN ROBUSTA
 */
const obtenerReservas = async (id_admin_esp_dep, { estado, fecha, cliente, limit = 20, offset = 0 }) => {
  const limitNum = parseInt(limit) || 20;
  const offsetNum = parseInt(offset) || 0;

  const conditions = [`e.id_admin_esp_dep = $${1}`];
  const params = [id_admin_esp_dep];
  
  if (estado) {
    conditions.push(`r.estado = $${params.length + 1}`);
    params.push(estado);
  }
  if (fecha) {
    conditions.push(`rh.fecha = $${params.length + 1}::date`);
    params.push(fecha);
  }
  if (cliente) {
    const like = `%${cliente}%`;
    conditions.push(`(u.nombre ILIKE $${params.length + 1} OR u.apellido ILIKE $${params.length + 1})`);
    params.push(like);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  params.push(limitNum, offsetNum);

  const queryDatos = `
    SELECT 
      r.id_reserva, 
      rh.fecha, 
      c.nombre AS cancha, 
      rh.hora_inicio, 
      rh.hora_fin,
      (u.nombre || ' ' || u.apellido) AS cliente, 
      r.monto_total, 
      r.estado
    FROM RESERVA r
    JOIN RESERVA_HORARIO rh ON r.id_reserva = rh.id_reserva
    JOIN ANFITRION a ON r.id_anfitrion = a.id_anfitrion
    JOIN CLIENTE cl ON a.id_anfitrion = cl.id_cliente
    JOIN USUARIO u ON cl.id_cliente = u.id_persona
    JOIN CANCHA c ON r.id_cancha = c.id_cancha
    JOIN ESPACIO_DEPORTIVO e ON c.id_espacio = e.id_espacio
    ${whereClause}
    ORDER BY rh.fecha DESC, rh.hora_inicio DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const queryTotal = `
    SELECT COUNT(DISTINCT r.id_reserva) AS total
    FROM RESERVA r
    JOIN RESERVA_HORARIO rh ON r.id_reserva = rh.id_reserva
    JOIN ANFITRION a ON r.id_anfitrion = a.id_anfitrion
    JOIN CLIENTE cl ON a.id_anfitrion = cl.id_cliente
    JOIN USUARIO u ON cl.id_cliente = u.id_persona
    JOIN CANCHA c ON r.id_cancha = c.id_cancha
    JOIN ESPACIO_DEPORTIVO e ON c.id_espacio = e.id_espacio
    ${whereClause}
  `;

  try {
    const [datos, totalResult] = await Promise.all([
      pool.query(queryDatos, params),
      pool.query(queryTotal, params.slice(0, -2)),
    ]);

    return {
      reservas: datos.rows,
      total: parseInt(totalResult.rows[0].total) || 0,
    };
  } catch (error) {
    console.error('Error en obtenerReservas:', error);
    throw error;
  }
};

/**
 * 7. Detalle de reserva
 */
const obtenerDetalleReserva = async (id_admin_esp_dep, id_reserva) => {
  const query = `
    SELECT 
      r.*,
      rh.fecha,
      rh.hora_inicio,
      rh.hora_fin,
      c.nombre AS cancha,
      e.nombre AS espacio,
      (u.nombre || ' ' || u.apellido) AS cliente,
      d.nombre AS disciplina,
      r.monto_total,
      r.monto_pagado,
      r.saldo
    FROM RESERVA r
    JOIN RESERVA_HORARIO rh ON r.id_reserva = rh.id_reserva
    JOIN CANCHA c ON r.id_cancha = c.id_cancha
    JOIN ESPACIO_DEPORTIVO e ON c.id_espacio = e.id_espacio
    JOIN ANFITRION a ON r.id_anfitrion = a.id_anfitrion
    JOIN CLIENTE cl ON a.id_anfitrion = cl.id_cliente
    JOIN USUARIO u ON cl.id_cliente = u.id_persona
    JOIN se_practica sp ON c.id_cancha = sp.id_cancha
    JOIN DISCIPLINA d ON sp.id_disciplina = d.id_disciplina
    WHERE r.id_reserva = $1 AND e.id_admin_esp_dep = $2
    LIMIT 1
  `;
  const result = await pool.query(query, [id_reserva, id_admin_esp_dep]);
  return result.rows[0] || null;
};

/**
 * 8. Reporte: Reservas por disciplina
 */
const obtenerReservasPorDisciplina = async (id_admin_esp_dep, desde, hasta) => {
  const query = `
    SELECT 
      d.nombre AS disciplina,
      COUNT(DISTINCT r.id_reserva) AS total_reservas,
      COALESCE(SUM(r.monto_total), 0) AS ingresos
    FROM RESERVA r
    JOIN CANCHA c ON r.id_cancha = c.id_cancha
    JOIN ESPACIO_DEPORTIVO e ON c.id_espacio = e.id_espacio
    JOIN se_practica sp ON c.id_cancha = sp.id_cancha
    JOIN DISCIPLINA d ON sp.id_disciplina = d.id_disciplina
    JOIN RESERVA_HORARIO rh ON r.id_reserva = rh.id_reserva
    WHERE r.estado != 'cancelada'
      AND e.id_admin_esp_dep = $1
      AND rh.fecha BETWEEN $2 AND $3
    GROUP BY d.id_disciplina, d.nombre
    ORDER BY total_reservas DESC
  `;
  const result = await pool.query(query, [id_admin_esp_dep, desde, hasta]);
  return result.rows;
};

/**
 * 9. Reporte: Ingresos por día
 */
const obtenerIngresos = async (id_admin_esp_dep, desde, hasta) => {
  const query = `
    SELECT 
      rh.fecha,
      COALESCE(SUM(r.monto_total), 0) AS ingresos_dia
    FROM RESERVA r
    JOIN RESERVA_HORARIO rh ON r.id_reserva = rh.id_reserva
    JOIN CANCHA c ON r.id_cancha = c.id_cancha
    JOIN ESPACIO_DEPORTIVO e ON c.id_espacio = e.id_espacio
    WHERE r.estado != 'cancelada'
      AND e.id_admin_esp_dep = $1
      AND rh.fecha BETWEEN $2 AND $3
    GROUP BY rh.fecha
    ORDER BY rh.fecha
  `;
  const result = await pool.query(query, [id_admin_esp_dep, desde, hasta]);
  return result.rows;
};

/**
 * 10. Ocupación por hora
 */
const obtenerOcupacionHoraria = async (id_admin_esp_dep, fecha) => {
  const query = `
    WITH espacios_admin AS (
      SELECT id_espacio 
      FROM ESPACIO_DEPORTIVO 
      WHERE id_admin_esp_dep = $1
    ),
    canchas_admin AS (
      SELECT c.id_cancha 
      FROM CANCHA c
      JOIN espacios_admin ea ON c.id_espacio = ea.id_espacio
      WHERE c.estado != 'mantenimiento'
    ),
    horas AS (
      SELECT (generate_series(
        ($2::date || ' 08:00')::timestamp,
        ($2::date || ' 22:00')::timestamp,
        '1 hour'::interval
      ))::time AS hora
    ),
    total_canchas_admin AS (
      SELECT COUNT(*) AS total FROM canchas_admin
    ),
    reservas_hora AS (
      SELECT 
        DATE_TRUNC('hour', rh.hora_inicio)::time AS hora,
        COUNT(*) AS reservas
      FROM RESERVA_HORARIO rh
      JOIN RESERVA r ON rh.id_reserva = r.id_reserva
      WHERE rh.fecha = $2::date 
        AND r.estado != 'cancelada'
        AND r.id_cancha IN (SELECT id_cancha FROM canchas_admin)
      GROUP BY 1
    )
    SELECT 
      h.hora::text,
      COALESCE(rh.reservas, 0) AS reservas,
      CASE 
        WHEN (SELECT total FROM total_canchas_admin) > 0
        THEN ROUND(COALESCE(rh.reservas, 0)::numeric / (SELECT total FROM total_canchas_admin) * 100, 1)
        ELSE 0
      END AS porcentaje
    FROM horas h
    LEFT JOIN reservas_hora rh ON h.hora = rh.hora
    ORDER BY h.hora;
  `;

  try {
    const result = await pool.query(query, [id_admin_esp_dep, fecha]);
    return result.rows;
  } catch (error) {
    console.error('Error en ocupacionHoraria:', error);
    throw error;
  }
};

/**
 * 11. Clientes frecuentes
 */
const obtenerClientesFrecuentes = async (id_admin_esp_dep) => {
  const query = `
    SELECT 
      (u.nombre || ' ' || u.apellido) AS cliente,
      COUNT(r.id_reserva) AS reservas
    FROM RESERVA r
    JOIN ANFITRION a ON r.id_anfitrion = a.id_anfitrion
    JOIN CLIENTE cl ON a.id_anfitrion = cl.id_cliente
    JOIN USUARIO u ON cl.id_cliente = u.id_persona
    JOIN CANCHA c ON r.id_cancha = c.id_cancha
    JOIN ESPACIO_DEPORTIVO e ON c.id_espacio = e.id_espacio
    WHERE r.estado != 'cancelada'
      AND e.id_admin_esp_dep = $1
    GROUP BY u.id_persona, u.nombre, u.apellido
    ORDER BY reservas DESC
    LIMIT 10
  `;
  const result = await pool.query(query, [id_admin_esp_dep]);
  return result.rows;
};

/**
 * 12. Canchas más rentables
 */
const obtenerCanchasRentables = async (id_admin_esp_dep, limit = 5, offset = 0) => {
  const query = `
    SELECT 
      c.nombre,
      COUNT(r.id_reserva) AS reservas,
      COALESCE(SUM(r.monto_total), 0) AS ingresos
    FROM CANCHA c
    JOIN ESPACIO_DEPORTIVO e ON c.id_espacio = e.id_espacio
    LEFT JOIN RESERVA r ON c.id_cancha = r.id_cancha AND r.estado != 'cancelada'
    WHERE e.id_admin_esp_dep = $1
    GROUP BY c.id_cancha, c.nombre
    ORDER BY ingresos DESC
    LIMIT $2 OFFSET $3
  `;
  const result = await pool.query(query, [id_admin_esp_dep, limit, offset]);
  return result.rows;
};

/**
 * 13. Vista global (superadmin)
 */
const obtenerVistaGlobal = async (id_admin_esp_dep) => {
  const query = `
    WITH espacios_admin AS (
      SELECT id_espacio FROM ESPACIO_DEPORTIVO WHERE id_admin_esp_dep = $1
    )
    SELECT 
      (SELECT COUNT(*) FROM espacios_admin) AS total_espacios,
      (SELECT COUNT(*) FROM CANCHA c 
       JOIN espacios_admin ea ON c.id_espacio = ea.id_espacio
       WHERE c.estado != 'mantenimiento') AS total_canchas,
      (
        SELECT COUNT(DISTINCT r.id_reserva)
        FROM RESERVA_HORARIO rh
        JOIN RESERVA r ON rh.id_reserva = r.id_reserva
        JOIN CANCHA c ON r.id_cancha = c.id_cancha
        JOIN espacios_admin ea ON c.id_espacio = ea.id_espacio
        WHERE EXTRACT(MONTH FROM rh.fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM rh.fecha) = EXTRACT(YEAR FROM CURRENT_DATE)
          AND r.estado != 'cancelada'
      ) AS reservas_mes,
      (
        SELECT COALESCE(SUM(r.monto_total), 0)
        FROM RESERVA r
        JOIN RESERVA_HORARIO rh ON r.id_reserva = rh.id_reserva
        JOIN CANCHA c ON r.id_cancha = c.id_cancha
        JOIN espacios_admin ea ON c.id_espacio = ea.id_espacio
        WHERE EXTRACT(MONTH FROM rh.fecha) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM rh.fecha) = EXTRACT(YEAR FROM CURRENT_DATE)
          AND r.estado != 'cancelada'
      ) AS ingresos_mes
  `;
  const result = await pool.query(query, [id_admin_esp_dep]);
  return result.rows[0];
};

// ===================================================================
// CONTROLADORES
// ===================================================================

// ===================================================================
// CONTROLADORES - MODIFICADOS
// ===================================================================

const resumenController = async (req, res) => {
  try {
    const { id_admin } = req.params;
    const data = await obtenerResumen(id_admin);
    res.json(respuesta(true, 'Resumen rápido', { resumen: data }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const ultimasReservasController = async (req, res) => {
  try {
    const { id_admin } = req.params;
    const limite = Math.min(parseInt(req.query.limit) || 3, 50);
    const data = await obtenerUltimasReservas(id_admin, limite);
    res.json(respuesta(true, 'Últimas reservas', { reservas: data }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const disciplinasController = async (req, res) => {
  try {
    const { id_admin } = req.params;
    const data = await obtenerDisciplinas(id_admin);
    res.json(respuesta(true, 'Disciplinas', { disciplinas: data }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const matrizController = async (req, res) => {
  const { id_admin } = req.params;
  const { fecha, disciplina, hora_inicio = '08:00', hora_fin = '22:00' } = req.query;
  if (!fecha) return res.status(400).json(respuesta(false, 'Fecha requerida'));

  try {
    const data = await obtenerMatrizDisponibilidad(id_admin, {
      fecha,
      hora_inicio,
      hora_fin,
      id_disciplina: disciplina ? parseInt(disciplina) : null,
    });
    res.json(respuesta(true, 'Matriz de disponibilidad', { matriz: data }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const canchasDisponiblesController = async (req, res) => {
  const { id_admin } = req.params;
  const { disciplina, fecha, hora_inicio = '08:00', hora_fin = '22:00' } = req.query;
  if (!disciplina || !fecha) {
    return res.status(400).json(respuesta(false, 'Faltan parámetros: disciplina y fecha'));
  }

  try {
    const data = await obtenerCanchasDisponibles(id_admin, {
      id_disciplina: parseInt(disciplina),
      fecha,
      hora_inicio,
      hora_fin,
    });
    res.json(respuesta(true, 'Canchas disponibles', { disponibles: data }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const reservasController = async (req, res) => {
  const { id_admin } = req.params;
  const { estado, fecha, cliente, limit = 20, offset = 0 } = req.query;
  try {
    const data = await obtenerReservas(id_admin, {
      estado,
      fecha,
      cliente,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
    res.json(respuesta(true, 'Lista de reservas', data));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const detalleReservaController = async (req, res) => {
  const { id_admin, id } = req.params;
  if (!id || isNaN(id)) return res.status(400).json(respuesta(false, 'ID inválido'));

  try {
    const data = await obtenerDetalleReserva(id_admin, id);
    if (!data) return res.status(404).json(respuesta(false, 'Reserva no encontrada'));
    res.json(respuesta(true, 'Detalle de reserva', { reserva: data }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const reporteDisciplinaController = async (req, res) => {
  const { id_admin } = req.params;
  const { desde, hasta } = req.query;
  try {
    const data = await obtenerReservasPorDisciplina(
      id_admin, 
      desde || '2025-01-01', 
      hasta || '2025-12-31'
    );
    res.json(respuesta(true, 'Reservas por disciplina', { data }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const reporteIngresosController = async (req, res) => {
  const { id_admin } = req.params;
  const { desde, hasta } = req.query;
  try {
    const data = await obtenerIngresos(
      id_admin,
      desde || '2025-01-01', 
      hasta || '2025-12-31'
    );
    res.json(respuesta(true, 'Ingresos por día', { data }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const ocupacionHorariaController = async (req, res) => {
  const { id_admin } = req.params;
  const { fecha } = req.query;
  try {
    const data = await obtenerOcupacionHoraria(
      id_admin,
      fecha || new Date().toISOString().split('T')[0]
    );
    res.json(respuesta(true, 'Ocupación por hora', { data }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const clientesFrecuentesController = async (req, res) => {
  try {
    const { id_admin } = req.params;
    const data = await obtenerClientesFrecuentes(id_admin);
    res.json(respuesta(true, 'Clientes frecuentes', { data }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const canchasRentablesController = async (req, res) => {
  try {
    const { id_admin } = req.params;
    const limit = parseInt(req.query.limit) || 5;
    const offset = parseInt(req.query.offset) || 0;
    const data = await obtenerCanchasRentables(id_admin, limit, offset);
    res.json(respuesta(true, 'Canchas rentables', { data, limit, offset }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

const vistaGlobalController = async (req, res) => {
  try {
    const { id_admin } = req.params;
    const data = await obtenerVistaGlobal(id_admin);
    res.json(respuesta(true, 'Vista global', { global: data }));
  } catch (error) {
    res.status(500).json(respuesta(false, error.message));
  }
};

// ===================================================================
// RUTAS
// ===================================================================

router.get('/resumen/:id_admin', resumenController);
router.get('/ultimas-reservas/:id_admin', ultimasReservasController);
router.get('/filtros/disciplinas/:id_admin', disciplinasController);
router.get('/matriz-disponibilidad/:id_admin', matrizController);
router.get('/canchas/disponibles/:id_admin', canchasDisponiblesController);
router.get('/reservas/:id_admin', reservasController);
router.get('/reservas//:id_admin', detalleReservaController);
router.get('/reportes/reservas-por-disciplina/:id_admin', reporteDisciplinaController);
router.get('/reportes/ingresos/:id_admin', reporteIngresosController);
router.get('/reportes/ocupacion-horaria/:id_admin', ocupacionHorariaController);
router.get('/reportes/clientes-frecuentes/:id_admin', clientesFrecuentesController);
router.get('/reportes/canchas-rentables/:id_admin', canchasRentablesController);
router.get('/vista-global/:id_admin', vistaGlobalController);

module.exports = router;