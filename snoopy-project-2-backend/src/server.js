// Carga variables de entorno desde .env
require("dotenv").config();

// Importa Express para crear el servidor
const express = require("express");

// Importa CORS para permitir peticiones desde el frontend
const cors = require("cors");

// Importa las rutas de autenticación
const authRoutes = require("./routes/auth.routes");

// Importa las rutas de movimientos
const movementsRoutes = require("./routes/movements.routes");

// Crea la aplicación Express
const app = express();

// Define el puerto del servidor
const PORT = process.env.PORT || 4000;

// Convierte FRONTEND_URL en una lista de orígenes permitidos
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Configuración de CORS para frontend local y desplegado
app.use(
  cors({
    origin(origin, callback) {
      // Permite peticiones sin origen, como Postman o PowerShell
      if (!origin) {
        return callback(null, true);
      }

      // Permite solo URLs configuradas en FRONTEND_URL
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Bloquea orígenes no permitidos
      return callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
  })
);

// Permite recibir JSON desde el frontend
app.use(express.json());

// Ruta raíz para comprobar que la API funciona
app.get("/", (req, res) => {
  res.json({
    message: "API Snoopy Project 2 funcionando correctamente.",
  });
});

// Ruta de salud para Render
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "snoopy-project-2-backend",
    timestamp: new Date().toISOString(),
  });
});

// Rutas de autenticación
app.use("/api/auth", authRoutes);

// Rutas de movimientos
app.use("/api/movements", movementsRoutes);

// Respuesta para rutas inexistentes
app.use((req, res) => {
  res.status(404).json({
    message: "Ruta no encontrada.",
    path: req.originalUrl,
  });
});

// Manejo global de errores
app.use((error, req, res, next) => {
  console.error("Error global del servidor:", {
    message: error.message,
    path: req.originalUrl,
    method: req.method,
  });

  res.status(500).json({
    message: "Error interno del servidor.",
    error: error.message,
  });
});

// Levanta el servidor
app.listen(PORT, () => {
  console.log(`Servidor Snoopy Project 2 corriendo en puerto ${PORT}`);
});