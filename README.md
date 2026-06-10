<<<<<<< HEAD
# Snoopy-Project-2
=======
# Snoopy Project 2

Sistema web para registrar, consultar, editar, cancelar e imprimir movimientos, construido con React, Vite, Node.js, Express y PostgreSQL.

## Estructura

```text
SnoopyProject2_Corregido/
├─ snoopy-project-2-backend/    API Express + PostgreSQL
├─ snoopy-project-2-frontend/   Interfaz React + Vite
├─ package.json                 Comandos para ejecutar backend y frontend juntos
└─ README.md
```

## Cambios aplicados en esta versión

- Se dejaron las carpetas principales con nombres propios de `snoopy-project-2`.
- Se actualizaron nombres de paquetes, scripts y descripciones a **Snoopy Project 2**.
- Se limpiaron referencias heredadas ajenas al nombre actual del sistema.
- Se dejó la hoja de estilos principal como `snoopy-project-2.css`.
- Se cambiaron las claves de sesión del navegador a `snoopyProject2...` para evitar choques con otros proyectos.
- Se ajustó la configuración local para usar una base separada llamada `snoopy_project_2`.
- Se retiró la carpeta `.git` del entregable para dejar una copia limpia.

## Configuración rápida

1. Crea la base de datos en PostgreSQL:

```sql
CREATE DATABASE snoopy_project_2;
```

2. Ejecuta el esquema inicial dentro de esa base:

```bash
psql -U postgres -d snoopy_project_2 -f snoopy-project-2-backend/src/database/schema.sql
```

3. Configura `snoopy-project-2-backend/.env` con tu usuario y contraseña de PostgreSQL:

```env
DATABASE_URL=postgresql://postgres:TU_PASSWORD@localhost:5432/snoopy_project_2
JWT_SECRET=cambia_esta_clave_por_una_muy_segura
```

4. Instala dependencias si no existen en tu copia local:

```bash
npm install
npm --prefix snoopy-project-2-backend install
npm --prefix snoopy-project-2-frontend install
```

5. Crea o actualiza el usuario administrador:

```bash
npm --prefix snoopy-project-2-backend run seed:admin
```

Con la configuración incluida, el usuario inicial queda así:

```text
Usuario: admin
Contraseña: admin123
```

6. Ejecuta el proyecto completo desde la raíz:

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Health check: `http://localhost:4000/health`

## Comandos útiles

```bash
# Ejecutar solo backend
npm run backend

# Ejecutar solo frontend
npm run frontend

# Compilar frontend
npm run frontend:build

# Crear usuario manual
npm --prefix snoopy-project-2-backend run create:user -- usuario contraseña admin
```


## Despliegue Render + Vercel

Consulta `README_DEPLOY_RENDER_VERCEL.md` para desplegar backend, base de datos y frontend.
>>>>>>> 5c74a26 (chore: init repo)
