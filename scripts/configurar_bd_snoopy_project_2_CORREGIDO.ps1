# Propósito: crear/configurar una base de datos independiente para Snoopy Project 2.
# Este script crea la BD, carga las tablas, genera el .env del backend y crea el usuario admin inicial.

param(
    # Propósito: usuario de PostgreSQL con permisos para crear bases de datos.
    [string]$UsuarioPostgres = "postgres",

    # Propósito: host de PostgreSQL. Se usa 127.0.0.1 para evitar problemas de localhost con IPv6 (::1).
    [string]$HostPostgres = "127.0.0.1",

    # Propósito: puerto local de PostgreSQL.
    [string]$PuertoPostgres = "5432",

    # Propósito: nombre de la base separada para Snoopy Project 2.
    [string]$BaseDatos = "snoopy_project_2",

    # Propósito: contraseña real del usuario PostgreSQL. Si se omite, el script la pedirá.
    [string]$PasswordPostgres = "",

    # Propósito: puerto donde correrá el backend Express.
    [string]$PuertoBackend = "4000",

    # Propósito: URL local del frontend React/Vite.
    [string]$FrontendUrl = "http://localhost:5173",

    # Propósito: usuario inicial para iniciar sesión dentro del sistema.
    [string]$AdminUsername = "admin",

    # Propósito: contraseña inicial del usuario del sistema, no de PostgreSQL.
    [string]$AdminPassword = "admin123",

    # Propósito: rol inicial del usuario administrador.
    [string]$AdminRole = "admin",

    # Propósito: reinstalar dependencias del backend aunque ya exista node_modules.
    [switch]$ReinstalarDependencias,

    # Propósito: borrar y recrear la base. Úsalo solo si quieres dejarla totalmente vacía.
    [switch]$RecrearBase
)

# Propósito: detener el script ante errores controlados.
$ErrorActionPreference = "Stop"

function Test-ComandoDisponible {
    param(
        # Propósito: comando que se quiere validar en el PATH.
        [string]$NombreComando
    )

    # Propósito: confirmar que la herramienta exista antes de continuar.
    if (-not (Get-Command $NombreComando -ErrorAction SilentlyContinue)) {
        throw "No se encontró '$NombreComando' en el PATH. Agrega PostgreSQL/Node al PATH o abre la terminal correcta."
    }
}

function Convertir-SecureStringATexto {
    param(
        # Propósito: contraseña capturada de forma segura desde PowerShell.
        [System.Security.SecureString]$SecurePassword
    )

    # Propósito: convertir temporalmente la contraseña para pasarla a psql mediante PGPASSWORD.
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

function Nueva-ClaveJwt {
    # Propósito: generar una clave aleatoria para firmar tokens JWT en ambiente local.
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    return [Convert]::ToBase64String($bytes)
}

function Invocar-Psql {
    param(
        # Propósito: argumentos que se enviarán al comando psql.
        [string[]]$Argumentos,

        # Propósito: descripción corta para mostrar un error más claro.
        [string]$Operacion
    )

    # Propósito: ejecutar psql capturando salida y errores sin provocar errores nulos con .Trim().
    $salida = & psql @Argumentos 2>&1
    $codigoSalida = $LASTEXITCODE
    $textoSalida = ($salida | Out-String).Trim()

    # Propósito: convertir errores de psql en mensajes entendibles para corregir rápido.
    if ($codigoSalida -ne 0) {
        if ($textoSalida -match "password authentication failed" -or $textoSalida -match "autentificaci[oó]n password fall[oó]") {
            throw @"
PostgreSQL rechazó la contraseña del usuario '$UsuarioPostgres'.

Solución:
1. Usa la contraseña real que asignaste al usuario '$UsuarioPostgres' al instalar PostgreSQL.
2. Esa contraseña NO es la del sistema Snoopy Project 2. No es 'admin123'.
3. Prueba conexión manual con:
   psql -U $UsuarioPostgres -h $HostPostgres -p $PuertoPostgres -d postgres
4. Cuando esa conexión funcione, vuelve a ejecutar este script.

Detalle original:
$textoSalida
"@
        }

        throw @"
Error ejecutando psql durante: $Operacion

Detalle:
$textoSalida
"@
    }

    return $textoSalida
}

# Propósito: pedir la contraseña de PostgreSQL solo si no se envió por parámetro.
if ([string]::IsNullOrWhiteSpace($PasswordPostgres)) {
    $securePassword = Read-Host "Contraseña REAL de PostgreSQL para el usuario $UsuarioPostgres" -AsSecureString
    $PasswordPostgres = Convertir-SecureStringATexto -SecurePassword $securePassword
}

# Propósito: validar herramientas necesarias para configurar el proyecto.
Test-ComandoDisponible -NombreComando "psql"
Test-ComandoDisponible -NombreComando "node"
Test-ComandoDisponible -NombreComando "npm"

# Propósito: resolver rutas tomando como base la carpeta scripts del proyecto.
$RutaScripts = Split-Path -Parent $MyInvocation.MyCommand.Path
$RutaProyecto = Split-Path -Parent $RutaScripts
$RutaBackend = Join-Path $RutaProyecto "snoopy-project-2-backend"
$RutaSchema = Join-Path $RutaBackend "src\database\schema.sql"
$RutaEnv = Join-Path $RutaBackend ".env"

# Propósito: validar que el script esté ubicado dentro de la estructura correcta.
if (-not (Test-Path $RutaBackend)) {
    throw "No se encontró la carpeta del backend en: $RutaBackend. Coloca este script dentro de la carpeta scripts del proyecto."
}

# Propósito: validar que exista el SQL con las tablas del sistema.
if (-not (Test-Path $RutaSchema)) {
    throw "No se encontró el archivo schema.sql en: $RutaSchema"
}

# Propósito: hacer que psql use la contraseña capturada sin pedirla en cada comando.
$env:PGPASSWORD = $PasswordPostgres

# Propósito: escapar nombres para evitar errores al crear o consultar la base.
$BaseDatosSql = $BaseDatos.Replace("'", "''")
$BaseDatosIdentificador = $BaseDatos.Replace('"', '""')

Write-Host "Probando conexión con PostgreSQL..." -ForegroundColor Cyan
Invocar-Psql -Argumentos @("-U", $UsuarioPostgres, "-h", $HostPostgres, "-p", $PuertoPostgres, "-tAc", "SELECT version();", "postgres") -Operacion "probar conexión con PostgreSQL" | Out-Null
Write-Host "Conexión correcta." -ForegroundColor Green

# Propósito: evitar borrar bases sensibles por accidente.
if ($RecrearBase -and ($BaseDatos -in @("postgres", "template0", "template1"))) {
    throw "Por seguridad no se puede recrear la base '$BaseDatos'. Usa otro nombre de base de datos."
}

if ($RecrearBase) {
    Write-Host "Recreando base de datos '$BaseDatos' desde cero..." -ForegroundColor Yellow

    # Propósito: cerrar conexiones activas antes de borrar la base.
    $CerrarConexionesSql = "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$BaseDatosSql' AND pid <> pg_backend_pid();"
    Invocar-Psql -Argumentos @("-U", $UsuarioPostgres, "-h", $HostPostgres, "-p", $PuertoPostgres, "-c", $CerrarConexionesSql, "postgres") -Operacion "cerrar conexiones de la base" | Out-Null

    # Propósito: borrar la base únicamente si el usuario pidió -RecrearBase.
    $DropSql = 'DROP DATABASE IF EXISTS "' + $BaseDatosIdentificador + '";'
    Invocar-Psql -Argumentos @("-U", $UsuarioPostgres, "-h", $HostPostgres, "-p", $PuertoPostgres, "-c", $DropSql, "postgres") -Operacion "eliminar base existente" | Out-Null
}

Write-Host "Creando/verificando base de datos '$BaseDatos'..." -ForegroundColor Cyan

# Propósito: consultar si la base ya existe antes de crearla.
$ConsultaExiste = "SELECT 1 FROM pg_database WHERE datname = '$BaseDatosSql';"
$Existe = Invocar-Psql -Argumentos @("-U", $UsuarioPostgres, "-h", $HostPostgres, "-p", $PuertoPostgres, "-tAc", $ConsultaExiste, "postgres") -Operacion "verificar existencia de la base"

if ([string]::IsNullOrWhiteSpace($Existe)) {
    # Propósito: crear una base independiente para que no comparta registros con otros proyectos.
    $CrearBaseSql = 'CREATE DATABASE "' + $BaseDatosIdentificador + '";'
    Invocar-Psql -Argumentos @("-U", $UsuarioPostgres, "-h", $HostPostgres, "-p", $PuertoPostgres, "-c", $CrearBaseSql, "postgres") -Operacion "crear base de datos" | Out-Null
    Write-Host "Base de datos creada correctamente." -ForegroundColor Green
}
else {
    Write-Host "La base de datos ya existe. Se conservarán sus datos actuales." -ForegroundColor Yellow
}

Write-Host "Cargando tablas desde schema.sql..." -ForegroundColor Cyan

# Propósito: crear/actualizar las tablas users, movements y movement_edits en la base separada.
Invocar-Psql -Argumentos @("-U", $UsuarioPostgres, "-h", $HostPostgres, "-p", $PuertoPostgres, "-d", $BaseDatos, "-f", $RutaSchema) -Operacion "cargar schema.sql" | Out-Null

# Propósito: codificar la contraseña para evitar errores en DATABASE_URL si contiene símbolos especiales.
$PasswordPostgresUrl = [System.Uri]::EscapeDataString($PasswordPostgres)
$DatabaseUrl = "postgresql://${UsuarioPostgres}:${PasswordPostgresUrl}@${HostPostgres}:${PuertoPostgres}/${BaseDatos}"
$JwtSecret = Nueva-ClaveJwt

Write-Host "Generando archivo .env del backend..." -ForegroundColor Cyan

# Propósito: escribir la configuración local apuntando únicamente a la BD independiente.
$ContenidoEnv = @"
# Puerto donde se ejecuta el backend
PORT=$PuertoBackend

# Entorno de ejecución local
NODE_ENV=development

# Base de datos independiente para Snoopy Project 2
DATABASE_URL="$DatabaseUrl"

# Clave generada para firmar tokens JWT
JWT_SECRET="$JwtSecret"

# URL permitida del frontend local
FRONTEND_URL=$FrontendUrl

# En PostgreSQL local debe quedarse en false
DB_SSL=false

# Usuario administrador inicial del sistema
ADMIN_USERNAME=$AdminUsername
ADMIN_PASSWORD=$AdminPassword
ADMIN_ROLE=$AdminRole
"@

Set-Content -Path $RutaEnv -Value $ContenidoEnv -Encoding UTF8

# Propósito: instalar dependencias del backend solo si hacen falta o si se solicita reinstalación.
$RutaNodeModulesBackend = Join-Path $RutaBackend "node_modules"
if ($ReinstalarDependencias -or -not (Test-Path $RutaNodeModulesBackend)) {
    Write-Host "Instalando dependencias del backend..." -ForegroundColor Cyan
    Push-Location $RutaBackend
    try {
        npm install
    }
    finally {
        Pop-Location
    }
}

Write-Host "Creando/actualizando usuario administrador inicial..." -ForegroundColor Cyan

# Propósito: ejecutar el seed que guarda el admin con contraseña encriptada.
Push-Location $RutaBackend
try {
    npm run seed:admin
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Snoopy Project 2 quedó conectado a una base independiente." -ForegroundColor Green
Write-Host "Base de datos: $BaseDatos" -ForegroundColor Green
Write-Host "Usuario del sistema: $AdminUsername" -ForegroundColor Green
Write-Host "Contraseña del sistema: $AdminPassword" -ForegroundColor Green
Write-Host ""
Write-Host "Para iniciar el proyecto ejecuta desde la raíz:" -ForegroundColor Cyan
Write-Host "npm run dev"
