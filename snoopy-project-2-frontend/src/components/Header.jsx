// Archivo: src/components/Header.jsx
// Propósito: header general reutilizable con submenús para Movimientos y Reportes.

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { getCurrentUser, hasCurrentPermission, logoutSession } from '../utils/session.js';

function Header({
    activePage = '',
    movementType = 'ingreso',
    reportType = 'ingreso',
    onMovementTypeChange,
    onReportTypeChange
}) {
    const navigate = useNavigate();
    const location = useLocation();
    const [isMovementsMenuOpen, setIsMovementsMenuOpen] = useState(false);
    const [isReportsMenuOpen, setIsReportsMenuOpen] = useState(false);
    const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const topbarShellRef = useRef(null);
    const isAdmin = hasCurrentPermission('cash_boxes.manage.all');
    const canManageUsers = hasCurrentPermission('users.manage');

    // Propósito: cerrar los menús abiertos cuando el usuario hace clic fuera del encabezado.
    useEffect(() => {
        const closeMenusWhenClickingOutside = (event) => {
            if (!topbarShellRef.current?.contains(event.target)) {
                setIsMovementsMenuOpen(false);
                setIsReportsMenuOpen(false);
                setIsSettingsMenuOpen(false);
                setIsMobileMenuOpen(false);
            }
        };

        const closeMenusWithEscape = (event) => {
            if (event.key === 'Escape') {
                setIsMovementsMenuOpen(false);
                setIsReportsMenuOpen(false);
                setIsSettingsMenuOpen(false);
                setIsMobileMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', closeMenusWhenClickingOutside);
        document.addEventListener('keydown', closeMenusWithEscape);

        return () => {
            document.removeEventListener('mousedown', closeMenusWhenClickingOutside);
            document.removeEventListener('keydown', closeMenusWithEscape);
        };
    }, []);

    // Cierra sesión y regresa al login.
    const handleLogout = (event) => {
        event.preventDefault();

        logoutSession();
        navigate('/login', { replace: true });
    };

    // Cambia a la vista de movimientos según el tipo seleccionado.
    const handleMovementClick = (type) => {
        setIsMovementsMenuOpen(false);
        setIsReportsMenuOpen(false);
        setIsSettingsMenuOpen(false);
        setIsMobileMenuOpen(false);

        if (onMovementTypeChange) {
            onMovementTypeChange(type);
            return;
        }

        navigate(`/dashboard?tipo=${type}`);
    };

    // Cambia a la vista de reportes según el tipo seleccionado.
    const handleReportClick = (type) => {
        setIsReportsMenuOpen(false);
        setIsMovementsMenuOpen(false);
        setIsSettingsMenuOpen(false);
        setIsMobileMenuOpen(false);

        if (onReportTypeChange) {
            onReportTypeChange(type);
            return;
        }

        if (type === 'egreso') {
            navigate('/reports/egresos');
            return;
        }

        if (type === 'cancelado') {
            navigate('/reports/cancelados');
            return;
        }

        navigate('/reports/ingresos');
    };

    // Abre o cierra el submenú de movimientos y cierra el de reportes.
    const toggleMovementsMenu = () => {
        setIsMovementsMenuOpen((current) => !current);
        setIsReportsMenuOpen(false);
        setIsSettingsMenuOpen(false);
    };

    // Abre o cierra el submenú de reportes y cierra el de movimientos.
    const toggleReportsMenu = () => {
        setIsReportsMenuOpen((current) => !current);
        setIsMovementsMenuOpen(false);
        setIsSettingsMenuOpen(false);
    };

    const toggleSettingsMenu = () => {
        setIsSettingsMenuOpen((current) => !current);
        setIsMovementsMenuOpen(false);
        setIsReportsMenuOpen(false);
    };

    // Propósito: abrir o cerrar el menú compacto usado en celulares.
    const toggleMobileMenu = () => {
        setIsMobileMenuOpen((current) => !current);
        setIsMovementsMenuOpen(false);
        setIsReportsMenuOpen(false);
        setIsSettingsMenuOpen(false);
    };

    // Propósito: cerrar el menú móvil al navegar a Inicio.
    const closeMobileMenu = () => {
        setIsMobileMenuOpen(false);
        setIsMovementsMenuOpen(false);
        setIsReportsMenuOpen(false);
        setIsSettingsMenuOpen(false);
    };

    return (
        <header className={`topbar ${isMobileMenuOpen ? 'mobile-menu-open' : ''}`}>
            <div className="topbar-shell" ref={topbarShellRef}>
                <Link to="/inicio" className="brand" aria-label="Ir a Inicio">
                    <span className="brand-logo-frame">
                        <img src="/snoopy-laptop-removebg-preview.png" alt="Logo Snoopy Project 2" className="brand-logo" />
                    </span>

                    <span className="brand-copy">
                        <span className="brand-name">Snoopy Project 2</span>
                        <span className="brand-subtitle">Control de ingresos y egresos</span>
                    </span>
                </Link>

                <button
                    type="button"
                    className="mobile-menu-toggle"
                    onClick={toggleMobileMenu}
                    aria-label={isMobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
                    aria-expanded={isMobileMenuOpen}
                >
                    <span className="material-icons-outlined">{isMobileMenuOpen ? 'close' : 'menu'}</span>
                    <span>Menú</span>
                </button>

                <nav className="top-nav" aria-label="Navegación principal">
                    <Link
                        to="/inicio"
                        className={`top-nav-link ${activePage === 'inicio' ? 'active' : ''}`}
                        data-guide-target="inicio"
                    >
                        <span className="material-icons-outlined top-nav-icon">dashboard</span>
                        <span>Inicio</span>
                    </Link>

                    <div className={`top-nav-dropdown ${isMovementsMenuOpen ? 'open' : ''}`}>
                        <button
                            type="button"
                            className={`top-nav-link top-nav-dropdown-toggle ${activePage === 'movimientos' ? 'active' : ''}`}
                            data-guide-target="movimientos"
                            onClick={toggleMovementsMenu}
                        >
                            <span className="top-nav-text">
                                <span className="material-icons-outlined top-nav-icon">swap_vert</span>
                                <span>Movimientos</span>
                            </span>
                            <span className="material-icons-outlined top-nav-mini-caret">expand_more</span>
                        </button>

                        <div className="top-nav-dropdown-menu">
                            <button
                                type="button"
                                className={`top-nav-dropdown-item ${movementType === 'ingreso' ? 'active' : ''}`}
                                onClick={() => handleMovementClick('ingreso')}
                            >
                                <span className="material-icons-outlined">south_west</span>
                                Ingresos
                            </button>

                            <button
                                type="button"
                                className={`top-nav-dropdown-item ${movementType === 'egreso' ? 'active' : ''}`}
                                onClick={() => handleMovementClick('egreso')}
                            >
                                <span className="material-icons-outlined">north_east</span>
                                Egresos
                            </button>
                        </div>
                    </div>

                    <div className={`top-nav-dropdown ${isReportsMenuOpen ? 'open' : ''}`}>
                        <button
                            type="button"
                            className={`top-nav-link top-nav-dropdown-toggle ${activePage === 'reportes' ? 'active' : ''}`}
                            data-guide-target="reportes"
                            onClick={toggleReportsMenu}
                        >
                            <span className="top-nav-text">
                                <span className="material-icons-outlined top-nav-icon">assessment</span>
                                <span>Reportes</span>
                            </span>
                            <span className="material-icons-outlined top-nav-mini-caret">expand_more</span>
                        </button>

                        <div className="top-nav-dropdown-menu">
                            <button
                                type="button"
                                className={`top-nav-dropdown-item ${reportType === 'ingreso' ? 'active' : ''}`}
                                onClick={() => handleReportClick('ingreso')}
                            >
                                <span className="material-icons-outlined">south_west</span>
                                Ingresos
                            </button>

                            <button
                                type="button"
                                className={`top-nav-dropdown-item ${reportType === 'egreso' ? 'active' : ''}`}
                                onClick={() => handleReportClick('egreso')}
                            >
                                <span className="material-icons-outlined">north_east</span>
                                Egresos
                            </button>

                            <button
                                type="button"
                                className={`top-nav-dropdown-item ${reportType === 'cancelado' ? 'active' : ''}`}
                                onClick={() => handleReportClick('cancelado')}
                            >
                                <span className="material-icons-outlined">block</span>
                                Historial
                            </button>
                        </div>
                    </div>

                    {isAdmin && (
                        <div className={`top-nav-dropdown ${isSettingsMenuOpen ? 'open' : ''}`}>
                            <button
                                type="button"
                                className={`top-nav-link top-nav-dropdown-toggle ${activePage === 'configuracion' ? 'active' : ''}`}
                                data-guide-target="configuracion"
                                onClick={toggleSettingsMenu}
                            >
                                <span className="top-nav-text">
                                    <span className="material-icons-outlined top-nav-icon">tune</span>
                                    <span>Configuración</span>
                                </span>
                                <span className="material-icons-outlined top-nav-mini-caret">expand_more</span>
                            </button>
                            <div className="top-nav-dropdown-menu">
                                <Link to="/configuracion/cajas" className={`top-nav-dropdown-item ${location.pathname === '/configuracion/cajas' ? 'active' : ''}`} onClick={closeMobileMenu}>
                                    <span className="material-icons-outlined">account_balance_wallet</span>
                                    Cajas
                                </Link>
                                {canManageUsers && <Link to="/configuracion/usuarios" className={`top-nav-dropdown-item ${location.pathname === '/configuracion/usuarios' ? 'active' : ''}`} onClick={closeMobileMenu}>
                                    <span className="material-icons-outlined">manage_accounts</span>
                                    Usuarios
                                </Link>}
                                {hasCurrentPermission('roles.manage') && <Link to="/configuracion/perfiles" className={`top-nav-dropdown-item ${location.pathname === '/configuracion/perfiles' ? 'active' : ''}`} onClick={closeMobileMenu}>
                                    <span className="material-icons-outlined">badge</span>
                                    Roles
                                </Link>}
                            </div>
                        </div>
                    )}
                </nav>

                <div className="topbar-actions">
                    <Link to="/inicio?novedades=1" className="user-box header-guide-link header-updates-link" title="Ver las funciones nuevas">
                        <span className="material-icons-outlined user-box-icon">new_releases</span>
                        <span>Novedades</span>
                    </Link>
                    <div className="user-box" title="Usuario activo">
                        <span className="material-icons-outlined user-box-icon">person</span>
                        <span>{getCurrentUser()}</span>
                    </div>

                    <button type="button" className="logout-link" onClick={handleLogout}>
                        <span className="material-icons-outlined">logout</span>
                        <span>Cerrar sesión</span>
                    </button>
                </div>

                <div className="mobile-menu-panel" aria-label="Menú móvil">
                    <Link
                        to="/inicio"
                        className={`mobile-menu-item ${activePage === 'inicio' ? 'active' : ''}`}
                        onClick={closeMobileMenu}
                    >
                        <span className="material-icons-outlined">dashboard</span>
                        <span>Inicio</span>
                    </Link>

                    <div className="mobile-menu-group">
                        <div className="mobile-menu-group-title">
                            <span className="material-icons-outlined">swap_vert</span>
                            <span>Movimientos</span>
                        </div>

                        <div className="mobile-menu-options">
                            <button
                                type="button"
                                className={`mobile-menu-chip ${movementType === 'ingreso' ? 'active' : ''}`}
                                onClick={() => handleMovementClick('ingreso')}
                            >
                                <span className="material-icons-outlined">south_west</span>
                                Ingresos
                            </button>

                            <button
                                type="button"
                                className={`mobile-menu-chip ${movementType === 'egreso' ? 'active' : ''}`}
                                onClick={() => handleMovementClick('egreso')}
                            >
                                <span className="material-icons-outlined">north_east</span>
                                Egresos
                            </button>
                        </div>
                    </div>

                    <div className="mobile-menu-group">
                        <div className="mobile-menu-group-title">
                            <span className="material-icons-outlined">assessment</span>
                            <span>Reportes</span>
                        </div>

                        <div className="mobile-menu-options">
                            <button
                                type="button"
                                className={`mobile-menu-chip ${reportType === 'ingreso' ? 'active' : ''}`}
                                onClick={() => handleReportClick('ingreso')}
                            >
                                <span className="material-icons-outlined">south_west</span>
                                Ingresos
                            </button>

                            <button
                                type="button"
                                className={`mobile-menu-chip ${reportType === 'egreso' ? 'active' : ''}`}
                                onClick={() => handleReportClick('egreso')}
                            >
                                <span className="material-icons-outlined">north_east</span>
                                Egresos
                            </button>

                            <button
                                type="button"
                                className={`mobile-menu-chip ${reportType === 'cancelado' ? 'active' : ''}`}
                                onClick={() => handleReportClick('cancelado')}
                            >
                                <span className="material-icons-outlined">block</span>
                                Historial
                            </button>
                        </div>
                    </div>

                    <div className="mobile-menu-footer">
                        {isAdmin && (
                            <>
                                <Link to="/configuracion/cajas" className="mobile-menu-logout" onClick={closeMobileMenu}>
                                    <span className="material-icons-outlined">account_balance_wallet</span>
                                    <span>Cajas</span>
                                </Link>
                                {canManageUsers && <Link to="/configuracion/usuarios" className="mobile-menu-logout" onClick={closeMobileMenu}>
                                    <span className="material-icons-outlined">manage_accounts</span>
                                    <span>Usuarios</span>
                                </Link>}
                                {hasCurrentPermission('roles.manage') && <Link to="/configuracion/perfiles" className="mobile-menu-logout" onClick={closeMobileMenu}>
                                    <span className="material-icons-outlined">badge</span>
                                    <span>Roles</span>
                                </Link>}
                            </>
                        )}

                        <div className="mobile-menu-user" title="Usuario activo">
                            <span className="material-icons-outlined">person</span>
                            <span>{getCurrentUser()}</span>
                        </div>

                        <Link to="/inicio?novedades=1" className="mobile-menu-logout" onClick={closeMobileMenu}>
                            <span className="material-icons-outlined">new_releases</span>
                            <span>Ver novedades</span>
                        </Link>

                        <button type="button" className="mobile-menu-logout" onClick={handleLogout}>
                            <span className="material-icons-outlined">logout</span>
                            <span>Cerrar sesión</span>
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
}

export default Header;
