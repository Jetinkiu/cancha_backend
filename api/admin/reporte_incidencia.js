// cancha_backend/api/admin/reporte_incidencia.js
const express = require('express');
const pool = require('../../config/database');

const router = express.Router();

// Función de respuesta estandarizada
const respuesta = (exito, mensaje, datos = null) => ({
  exito,
  mensaje,
  datos,
});

// MODELOS - Funciones puras para operaciones de base de datos

/**
 * Obtener datos específicos de reportes de incidencia
 */
const obtenerDatosEspecificos = async (limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        ri.id_reporte, 
        ri.detalle, 
        ri.sugerencia, 
        ri.verificado,
        -- Información del CONTROL (si existe)
        c.id_control,
        p_c.nombre AS control_nombre, 
        p_c.apellido AS control_apellido,
        -- Información del ENCARGADO (si existe)
        e.id_encargado,
        p_e.nombre AS encargado_nombre, 
        p_e.apellido AS encargado_apellido,
        -- Información de la RESERVA
        r.id_reserva, 
        a.id_anfitrion, 
        p_a.nombre AS anfitrion_nombre, 
        p_a.apellido AS anfitrion_apellido,
        ca.id_cancha, 
        ca.nombre AS cancha_nombre
      FROM reporte_incidencia ri
      LEFT JOIN control c ON ri.id_control = c.id_control
      LEFT JOIN usuario p_c ON c.id_control = p_c.id_persona
      LEFT JOIN encargado e ON ri.id_encargado = e.id_encargado
      LEFT JOIN usuario p_e ON e.id_encargado = p_e.id_persona
      JOIN reserva r ON ri.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente cl ON a.id_anfitrion = cl.id_cliente
      JOIN usuario p_a ON cl.id_cliente = p_a.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      ORDER BY ri.id_reporte DESC
      LIMIT $1 OFFSET $2
    `;
    
    const queryTotal = `SELECT COUNT(*) FROM reporte_incidencia`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);
    
    return {
      reportes: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en obtenerDatosEspecificos:', error);
    throw error;
  }
};

/**
 * Obtener reportes de incidencia con filtros
 */
const obtenerReportesFiltrados = async (tipoFiltro, limite = 10, offset = 0) => {
  try {
    let whereClause = '';
    let orderClause = 'ri.id_reporte DESC';
    
    switch(tipoFiltro) {
      case 'verificado_si':
        whereClause = 'WHERE ri.verificado = true';
        break;
      case 'verificado_no':
        whereClause = 'WHERE ri.verificado = false';
        break;
      case 'anfitrion_nombre':
        orderClause = 'p_a.nombre ASC, p_a.apellido ASC';
        break;
      case 'cancha_nombre':
        orderClause = 'ca.nombre ASC';
        break;
      case 'fecha_reciente':
        orderClause = 'ri.id_reporte DESC';
        break;
      default:
        orderClause = 'ri.id_reporte DESC';
    }

    const queryDatos = `
      SELECT 
        ri.id_reporte, 
        ri.detalle, 
        ri.sugerencia, 
        ri.verificado,
        -- Control
        c.id_control,
        p_c.nombre AS control_nombre, 
        p_c.apellido AS control_apellido,
        -- Encargado
        e.id_encargado,
        p_e.nombre AS encargado_nombre, 
        p_e.apellido AS encargado_apellido,
        -- Reserva
        r.id_reserva, 
        a.id_anfitrion, 
        p_a.nombre AS anfitrion_nombre, 
        p_a.apellido AS anfitrion_apellido,
        ca.id_cancha, 
        ca.nombre AS cancha_nombre
      FROM reporte_incidencia ri
      LEFT JOIN control c ON ri.id_control = c.id_control
      LEFT JOIN usuario p_c ON c.id_control = p_c.id_persona
      LEFT JOIN encargado e ON ri.id_encargado = e.id_encargado
      LEFT JOIN usuario p_e ON e.id_encargado = p_e.id_persona
      JOIN reserva r ON ri.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente cl ON a.id_anfitrion = cl.id_cliente
      JOIN usuario p_a ON cl.id_cliente = p_a.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      ${whereClause}
      ORDER BY ${orderClause}
      LIMIT $1 OFFSET $2
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM reporte_incidencia ri
      ${whereClause}
    `;

    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [limite, offset]),
      pool.query(queryTotal)
    ]);

    return {
      reportes: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw new Error(`Error al obtener reportes filtrados: ${error.message}`);
  }
};

/**
 * Buscar reportes de incidencia por texto
 */
const buscarReportes = async (texto, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        ri.id_reporte, 
        ri.detalle, 
        ri.sugerencia, 
        ri.verificado,
        -- Control
        c.id_control,
        p_c.nombre AS control_nombre, 
        p_c.apellido AS control_apellido,
        -- Encargado
        e.id_encargado,
        p_e.nombre AS encargado_nombre, 
        p_e.apellido AS encargado_apellido,
        -- Reserva
        r.id_reserva, 
        a.id_anfitrion, 
        p_a.nombre AS anfitrion_nombre, 
        p_a.apellido AS anfitrion_apellido,
        ca.id_cancha, 
        ca.nombre AS cancha_nombre
      FROM reporte_incidencia ri
      LEFT JOIN control c ON ri.id_control = c.id_control
      LEFT JOIN usuario p_c ON c.id_control = p_c.id_persona
      LEFT JOIN encargado e ON ri.id_encargado = e.id_encargado
      LEFT JOIN usuario p_e ON e.id_encargado = p_e.id_persona
      JOIN reserva r ON ri.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente cl ON a.id_anfitrion = cl.id_cliente
      JOIN usuario p_a ON cl.id_cliente = p_a.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE 
        p_c.nombre ILIKE $1 OR 
        p_c.apellido ILIKE $1 OR 
        p_e.nombre ILIKE $1 OR 
        p_e.apellido ILIKE $1 OR 
        p_a.nombre ILIKE $1 OR 
        p_a.apellido ILIKE $1 OR 
        ca.nombre ILIKE $1 OR 
        ri.detalle ILIKE $1 OR 
        ri.sugerencia ILIKE $1
      ORDER BY ri.id_reporte DESC
      LIMIT $2 OFFSET $3
    `;

    const queryTotal = `
      SELECT COUNT(*) 
      FROM reporte_incidencia ri
      LEFT JOIN control c ON ri.id_control = c.id_control
      LEFT JOIN usuario p_c ON c.id_control = p_c.id_persona
      LEFT JOIN encargado e ON ri.id_encargado = e.id_encargado
      LEFT JOIN usuario p_e ON e.id_encargado = p_e.id_persona
      JOIN reserva r ON ri.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente cl ON a.id_anfitrion = cl.id_cliente
      JOIN usuario p_a ON cl.id_cliente = p_a.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE 
        p_c.nombre ILIKE $1 OR 
        p_c.apellido ILIKE $1 OR 
        p_e.nombre ILIKE $1 OR 
        p_e.apellido ILIKE $1 OR 
        p_a.nombre ILIKE $1 OR 
        p_a.apellido ILIKE $1 OR 
        ca.nombre ILIKE $1 OR 
        ri.detalle ILIKE $1 OR 
        ri.sugerencia ILIKE $1
    `;
    
    const sanitizeInput = (input) => input.replace(/[%_\\]/g, '\\$&');
    const terminoBusqueda = `%${sanitizeInput(texto)}%`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [terminoBusqueda, limite, offset]),
      pool.query(queryTotal, [terminoBusqueda])
    ]);

    return {
      reportes: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener reporte de incidencia por ID
 */
const obtenerReportePorId = async (id) => {
  try {
    const query = `
      SELECT 
        ri.*,
        -- Control
        c.id_control,
        p_c.nombre AS control_nombre, 
        p_c.apellido AS control_apellido,
        p_c.correo AS control_correo,
        -- Encargado
        e.id_encargado,
        p_e.nombre AS encargado_nombre, 
        p_e.apellido AS encargado_apellido,
        p_e.correo AS encargado_correo,
        -- Reserva
        r.id_reserva, 
        a.id_anfitrion, 
        p_a.nombre AS anfitrion_nombre, 
        p_a.apellido AS anfitrion_apellido,
        ca.id_cancha, 
        ca.nombre AS cancha_nombre,
        esp.nombre AS espacio_nombre
      FROM reporte_incidencia ri
      LEFT JOIN control c ON ri.id_control = c.id_control
      LEFT JOIN usuario p_c ON c.id_control = p_c.id_persona
      LEFT JOIN encargado e ON ri.id_encargado = e.id_encargado
      LEFT JOIN usuario p_e ON e.id_encargado = p_e.id_persona
      JOIN reserva r ON ri.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente cl ON a.id_anfitrion = cl.id_cliente
      JOIN usuario p_a ON cl.id_cliente = p_a.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      JOIN espacio_deportivo esp ON ca.id_espacio = esp.id_espacio
      WHERE ri.id_reporte = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Crear nuevo reporte de incidencia (para control O encargado)
 */
const crearReporte = async (datosReporte) => {
  try {
    console.log('📝 Datos recibidos para crear reporte:', datosReporte);
    
    // Validaciones básicas
    const tieneControl = datosReporte.id_control && !isNaN(datosReporte.id_control);
    const tieneEncargado = datosReporte.id_encargado && !isNaN(datosReporte.id_encargado);
    
    if (!tieneControl && !tieneEncargado) {
      throw new Error('Se requiere ID de control o encargado');
    }
    
    if (!datosReporte.id_reserva || isNaN(datosReporte.id_reserva)) {
      throw new Error('El ID de la reserva es obligatorio y debe ser un número');
    }

    // Verificar si la reserva existe
    const reservaQuery = `SELECT id_reserva FROM reserva WHERE id_reserva = $1`;
    const reservaResult = await pool.query(reservaQuery, [datosReporte.id_reserva]);
    if (!reservaResult.rows[0]) {
      throw new Error('La reserva asociada no existe');
    }

    // Verificar si el control existe (si se proporciona)
    if (tieneControl) {
      const controlQuery = `SELECT id_control FROM control WHERE id_control = $1`;
      const controlResult = await pool.query(controlQuery, [datosReporte.id_control]);
      if (!controlResult.rows[0]) {
        throw new Error('El control asociado no existe');
      }
    }

    // Verificar si el encargado existe (si se proporciona)
    if (tieneEncargado) {
      const encargadoQuery = `SELECT id_encargado FROM encargado WHERE id_encargado = $1`;
      const encargadoResult = await pool.query(encargadoQuery, [datosReporte.id_encargado]);
      if (!encargadoResult.rows[0]) {
        throw new Error('El encargado asociado no existe');
      }
    }

    // Construir query dinámicamente según qué ID se proporciona
    let query;
    let values;
    
    if (tieneControl) {
      query = `
        INSERT INTO reporte_incidencia (
          detalle, sugerencia, id_control, id_reserva, verificado
        ) 
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      values = [
        datosReporte.detalle || null,
        datosReporte.sugerencia || null,
        datosReporte.id_control,
        datosReporte.id_reserva,
        datosReporte.verificado !== undefined ? datosReporte.verificado : false
      ];
    } else if (tieneEncargado) {
      query = `
        INSERT INTO reporte_incidencia (
          detalle, sugerencia, id_encargado, id_reserva, verificado
        ) 
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      values = [
        datosReporte.detalle || null,
        datosReporte.sugerencia || null,
        datosReporte.id_encargado,
        datosReporte.id_reserva,
        datosReporte.verificado !== undefined ? datosReporte.verificado : false
      ];
    }

    console.log('🚀 Ejecutando query:', query);
    console.log('📦 Valores:', values);

    const { rows } = await pool.query(query, values);
    return rows[0];
  } catch (error) {
    console.error('❌ Error al crear reporte de incidencia:', error.message);
    throw new Error(error.message);
  }
};

/**
 * Crear reporte desde control (endpoint específico)
 */
const crearReporteDesdeControl = async (datosReporte) => {
  try {
    console.log('🎯 Creando reporte desde control:', datosReporte);
    
    // Validaciones específicas para control
    if (!datosReporte.id_control || isNaN(datosReporte.id_control)) {
      throw new Error('El ID del control es obligatorio');
    }

    if (!datosReporte.id_reserva || isNaN(datosReporte.id_reserva)) {
      throw new Error('El ID de la reserva es obligatorio');
    }

    // Verificar si el control existe
    const controlQuery = `SELECT id_control FROM control WHERE id_control = $1`;
    const controlResult = await pool.query(controlQuery, [datosReporte.id_control]);
    if (!controlResult.rows[0]) {
      throw new Error('El control asociado no existe');
    }

    // Verificar si la reserva existe
    const reservaQuery = `SELECT id_reserva FROM reserva WHERE id_reserva = $1`;
    const reservaResult = await pool.query(reservaQuery, [datosReporte.id_reserva]);
    if (!reservaResult.rows[0]) {
      throw new Error('La reserva asociada no existe');
    }

    const query = `
      INSERT INTO reporte_incidencia (
        detalle, sugerencia, id_control, id_reserva, verificado
      ) 
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [
      datosReporte.detalle || null,
      datosReporte.sugerencia || null,
      datosReporte.id_control,
      datosReporte.id_reserva,
      false // Los reportes de control siempre inician como no verificados
    ];

    console.log('🚀 Ejecutando query para control:', query);
    console.log('📦 Valores:', values);

    const { rows } = await pool.query(query, values);
    return rows[0];
  } catch (error) {
    console.error('❌ Error al crear reporte desde control:', error.message);
    throw new Error(error.message);
  }
};

/**
 * Actualizar reporte de incidencia
 */
const actualizarReporte = async (id, camposActualizar) => {
  try {
    const camposPermitidos = ['detalle', 'sugerencia', 'id_control', 'id_encargado', 'id_reserva', 'verificado'];
    const campos = Object.keys(camposActualizar).filter(key => camposPermitidos.includes(key));

    if (campos.length === 0) {
      throw new Error('No hay campos válidos para actualizar');
    }

    // Validaciones adicionales
    if (camposActualizar.verificado !== undefined && typeof camposActualizar.verificado !== 'boolean') {
      throw new Error('El campo verificado debe ser un valor booleano');
    }

    // Verificar control si se proporciona
    if (camposActualizar.id_control) {
      const controlQuery = `SELECT id_control FROM control WHERE id_control = $1`;
      const controlResult = await pool.query(controlQuery, [camposActualizar.id_control]);
      if (!controlResult.rows[0]) {
        throw new Error('El control asociado no existe');
      }
    }

    // Verificar encargado si se proporciona
    if (camposActualizar.id_encargado) {
      const encargadoQuery = `SELECT id_encargado FROM encargado WHERE id_encargado = $1`;
      const encargadoResult = await pool.query(encargadoQuery, [camposActualizar.id_encargado]);
      if (!encargadoResult.rows[0]) {
        throw new Error('El encargado asociado no existe');
      }
    }

    const setClause = campos.map((campo, index) => `${campo} = $${index + 2}`).join(', ');
    
    const values = campos.map(campo => {
      const value = camposActualizar[campo];
      if (campo === 'verificado') return value;
      if (['detalle', 'sugerencia'].includes(campo)) return value || null;
      return value !== undefined && value !== null ? value : null;
    });

    const query = `
      UPDATE reporte_incidencia 
      SET ${setClause}
      WHERE id_reporte = $1
      RETURNING *
    `;

    console.log('🔧 Actualizando reporte:', { id, campos, values });
    const result = await pool.query(query, [id, ...values]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('❌ Error en actualizarReporte:', error.message);
    throw error;
  }
};

/**
 * Eliminar reporte de incidencia
 */
const eliminarReporte = async (id) => {
  try {
    const query = 'DELETE FROM reporte_incidencia WHERE id_reporte = $1 RETURNING id_reporte';
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  } catch (error) {
    throw error;
  }
};

/**
 * Obtener reportes por ID de control
 */
const obtenerReportesPorControl = async (id_control, limite = 10, offset = 0) => {
  try {
    const queryDatos = `
      SELECT 
        ri.id_reporte, 
        ri.detalle, 
        ri.sugerencia, 
        ri.verificado,
        c.id_control,
        p_c.nombre AS control_nombre, 
        p_c.apellido AS control_apellido,
        r.id_reserva, 
        a.id_anfitrion, 
        p_a.nombre AS anfitrion_nombre, 
        p_a.apellido AS anfitrion_apellido,
        ca.id_cancha, 
        ca.nombre AS cancha_nombre
      FROM reporte_incidencia ri
      LEFT JOIN control c ON ri.id_control = c.id_control
      LEFT JOIN usuario p_c ON c.id_control = p_c.id_persona
      JOIN reserva r ON ri.id_reserva = r.id_reserva
      JOIN anfitrion a ON r.id_anfitrion = a.id_anfitrion
      JOIN cliente cl ON a.id_anfitrion = cl.id_cliente
      JOIN usuario p_a ON cl.id_cliente = p_a.id_persona
      JOIN cancha ca ON r.id_cancha = ca.id_cancha
      WHERE ri.id_control = $1
      ORDER BY ri.id_reporte DESC
      LIMIT $2 OFFSET $3
    `;
    
    const queryTotal = `SELECT COUNT(*) FROM reporte_incidencia WHERE id_control = $1`;
    
    const [resultDatos, resultTotal] = await Promise.all([
      pool.query(queryDatos, [id_control, limite, offset]),
      pool.query(queryTotal, [id_control])
    ]);
    
    return {
      reportes: resultDatos.rows,
      total: parseInt(resultTotal.rows[0].count)
    };
  } catch (error) {
    console.error('Error en obtenerReportesPorControl:', error);
    throw error;
  }
};

// CONTROLADORES

const obtenerDatosEspecificosController = async (req, res) => {
  try {
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    const { reportes, total } = await obtenerDatosEspecificos(limite, offset);
    
    res.json(respuesta(true, 'Reportes obtenidos correctamente', {
      reportes,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en obtenerDatosEspecificos:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerReportesFiltradosController = async (req, res) => {
  try {
    const { tipo } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const tiposValidos = ['verificado_si', 'verificado_no', 'anfitrion_nombre', 'cancha_nombre', 'fecha_reciente'];
    
    if (!tipo || !tiposValidos.includes(tipo)) {
      return res.status(400).json(respuesta(false, 
        `Tipo inválido. Valores permitidos: ${tiposValidos.join(', ')}`
      ));
    }

    const { reportes, total } = await obtenerReportesFiltrados(tipo, limite, offset);
    res.json(respuesta(true, `Reportes filtrados obtenidos`, {
      reportes,
      filtro: tipo,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en obtenerReportesFiltrados:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

const buscarReportesController = async (req, res) => {
  try {
    const { q } = req.query;
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    if (!q) {
      return res.status(400).json(respuesta(false, 'Parámetro de búsqueda "q" requerido'));
    }

    const { reportes, total } = await buscarReportes(q, limite, offset);
    res.json(respuesta(true, 'Reportes obtenidos', {
      reportes,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en buscarReportes:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerReportePorIdController = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID inválido'));
    }

    const reporte = await obtenerReportePorId(parseInt(id));
    if (!reporte) {
      return res.status(404).json(respuesta(false, 'Reporte no encontrado'));
    }

    res.json(respuesta(true, 'Reporte obtenido', { reporte }));
  } catch (error) {
    console.error('Error en obtenerReportePorId:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

const crearReporteController = async (req, res) => {
  try {
    const datos = req.body;
    console.log('📨 Datos recibidos para crear reporte:', datos);

    // Validar campos obligatorios
    const camposObligatorios = ['id_reserva'];
    if (!datos.id_control && !datos.id_encargado) {
      camposObligatorios.push('id_control o id_encargado');
    }
    
    const faltantes = camposObligatorios.filter(campo => {
      if (campo === 'id_control o id_encargado') {
        return !datos.id_control && !datos.id_encargado;
      }
      return !datos[campo] || datos[campo].toString().trim() === '';
    });

    if (faltantes.length > 0) {
      return res.status(400).json(
        respuesta(false, `Faltan campos: ${faltantes.join(', ')}`)
      );
    }

    const nuevoReporte = await crearReporte(datos);
    res.status(201).json(respuesta(true, 'Reporte creado', { reporte: nuevoReporte }));
  } catch (error) {
    console.error('Error en crearReporte:', error.message);
    if (error.code === '23505') {
      return res.status(400).json(respuesta(false, 'El reporte ya existe'));
    }
    res.status(500).json(respuesta(false, error.message));
  }
};

const crearReporteControlController = async (req, res) => {
  try {
    const datos = req.body;
    console.log('🎯 Creando reporte desde control (controller):', datos);

    const camposObligatorios = ['id_control', 'id_reserva'];
    const faltantes = camposObligatorios.filter(campo => !datos[campo] || datos[campo].toString().trim() === '');

    if (faltantes.length > 0) {
      return res.status(400).json(
        respuesta(false, `Faltan campos: ${faltantes.join(', ')}`)
      );
    }

    const nuevoReporte = await crearReporteDesdeControl(datos);
    res.status(201).json(respuesta(true, 'Reporte desde control creado', { reporte: nuevoReporte }));
  } catch (error) {
    console.error('Error en crearReporteControl:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

const actualizarReporteController = async (req, res) => {
  try {
    const { id } = req.params;
    const camposActualizar = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID inválido'));
    }

    if (Object.keys(camposActualizar).length === 0) {
      return res.status(400).json(respuesta(false, 'No hay campos para actualizar'));
    }

    const reporteActualizado = await actualizarReporte(parseInt(id), camposActualizar);
    if (!reporteActualizado) {
      return res.status(404).json(respuesta(false, 'Reporte no encontrado'));
    }

    res.json(respuesta(true, 'Reporte actualizado', { reporte: reporteActualizado }));
  } catch (error) {
    console.error('Error en actualizarReporte:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

const eliminarReporteController = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(id)) {
      return res.status(400).json(respuesta(false, 'ID inválido'));
    }

    const reporteEliminado = await eliminarReporte(parseInt(id));
    if (!reporteEliminado) {
      return res.status(404).json(respuesta(false, 'Reporte no encontrado'));
    }

    res.json(respuesta(true, 'Reporte eliminado'));
  } catch (error) {
    console.error('Error en eliminarReporte:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

const obtenerReportesControlController = async (req, res) => {
  try {
    const { id_control } = req.params;
    if (!id_control || isNaN(id_control)) {
      return res.status(400).json(respuesta(false, 'ID de control inválido'));
    }
    
    const limite = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    
    const { reportes, total } = await obtenerReportesPorControl(parseInt(id_control), limite, offset);
    res.json(respuesta(true, 'Reportes del control obtenidos', {
      reportes,
      paginacion: { limite, offset, total }
    }));
  } catch (error) {
    console.error('Error en obtenerReportesControl:', error.message);
    res.status(500).json(respuesta(false, error.message));
  }
};

// RUTAS
router.get('/datos-especificos', obtenerDatosEspecificosController);
router.get('/filtro', obtenerReportesFiltradosController);
router.get('/buscar', buscarReportesController);
router.get('/dato-individual/:id', obtenerReportePorIdController);
router.get('/datos-segun-rol/:id_control', obtenerReportesControlController);

// Endpoints para crear reportes
router.post('/', crearReporteController); // Para control O encargado
router.post('/control', crearReporteControlController); // Específico para control

router.patch('/:id', actualizarReporteController);
router.delete('/:id', eliminarReporteController);

module.exports = router;