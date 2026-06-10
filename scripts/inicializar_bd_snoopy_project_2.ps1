# Propósito: crear la base de datos de Snoopy Project 2 y cargar el esquema inicial en PostgreSQL.
# Requisito: tener psql instalado y disponible en el PATH de Windows.

param(
    # Propósito: indicar el usuario de PostgreSQL que puede crear bases de datos.
    [string]$Usuario = "postgres",

    # Propósito: indicar el host donde corre PostgreSQL.
    [string]$HostPostgres = "localhost",

    # Propósito: indicar el puerto de PostgreSQL.
    [string]$Puerto = "5432",

    # Propósito: indicar el nombre de la base separada para esta copia del proyecto.
    [string]$BaseDatos = "snoopy_project_2"
)

# Propósito: detener el script si algún comando falla.
$ErrorActionPreference = "Stop"

# Propósito: resolver la ruta del proyecto tomando como base la carpeta scripts.
$RutaScripts = Split-Path -Parent $MyInvocation.MyCommand.Path
$RutaProyecto = Split-Path -Parent $RutaScripts
$RutaSchema = Join-Path $RutaProyecto "snoopy-project-2-backend\src\database\schema.sql"

# Propósito: validar que exista el archivo schema.sql antes de intentar cargarlo.
if (-not (Test-Path $RutaSchema)) {
    throw "No se encontró el archivo schema.sql en: $RutaSchema"
}

Write-Host "Creando base de datos $BaseDatos si no existe..." -ForegroundColor Cyan

# Propósito: crear la base solamente cuando todavía no existe.
$ConsultaExiste = "SELECT 1 FROM pg_database WHERE datname = '$BaseDatos';"
$Existe = psql -U $Usuario -h $HostPostgres -p $Puerto -tAc $ConsultaExiste postgres

if (-not $Existe) {
    psql -U $Usuario -h $HostPostgres -p $Puerto -c "CREATE DATABASE $BaseDatos;" postgres
    Write-Host "Base de datos creada." -ForegroundColor Green
} else {
    Write-Host "La base de datos ya existe." -ForegroundColor Yellow
}

Write-Host "Cargando esquema inicial..." -ForegroundColor Cyan

# Propósito: ejecutar el schema.sql dentro de la base del proyecto.
psql -U $Usuario -h $HostPostgres -p $Puerto -d $BaseDatos -f $RutaSchema

Write-Host "Base de datos lista para Snoopy Project 2." -ForegroundColor Green
