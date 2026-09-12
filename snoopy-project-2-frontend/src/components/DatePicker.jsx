// Propósito: selector de una sola fecha con calendario mensual y navegación clara.

import { useEffect, useMemo, useRef, useState } from 'react';

const WEEKDAY_LABELS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
const MONTH_LABELS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function parseDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) return null;

    return {
        year: Number(match[1]),
        month: Number(match[2]) - 1,
        day: Number(match[3]),
    };
}

function toISODate(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

function formatDateLabel(value) {
    const parsed = parseDate(value);
    if (!parsed) return 'Seleccionar fecha';

    return new Date(parsed.year, parsed.month, parsed.day).toLocaleDateString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

function DatePicker({ id, value, onChange, clearable = false, ariaLabel, max }) {
    const today = new Date();
    const parsedValue = parseDate(value);
    const [isOpen, setIsOpen] = useState(false);
    const [viewYear, setViewYear] = useState(parsedValue?.year || today.getFullYear());
    const [viewMonth, setViewMonth] = useState(parsedValue?.month ?? today.getMonth());
    const containerRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;

        const handlePointerDown = (event) => {
            if (!containerRef.current?.contains(event.target)) setIsOpen(false);
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setIsOpen(false);
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    const calendarDays = useMemo(() => {
        const firstDay = new Date(viewYear, viewMonth, 1);
        const firstCell = new Date(viewYear, viewMonth, 1 - firstDay.getDay());

        return Array.from({ length: 42 }, (_, index) => {
            const date = new Date(firstCell);
            date.setDate(firstCell.getDate() + index);
            return date;
        });
    }, [viewYear, viewMonth]);

    const monthLabel = `${MONTH_LABELS[viewMonth]} ${viewYear}`;

    const moveMonth = (amount) => {
        const nextDate = new Date(viewYear, viewMonth + amount, 1);
        setViewYear(nextDate.getFullYear());
        setViewMonth(nextDate.getMonth());
    };

    const selectDate = (date) => {
        if (max && toISODate(date) > max) return;

        onChange({ target: { value: toISODate(date) } });
        setIsOpen(false);
    };

    const clearDate = () => {
        onChange({ target: { value: '' } });
        setIsOpen(false);
    };

    return (
        <div ref={containerRef} className={`date-picker ${isOpen ? 'is-open' : ''}`.trim()}>
            <button
                id={id}
                type="button"
                className="filter-control date-picker-trigger"
                aria-label={ariaLabel}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                aria-controls={`${id}Calendar`}
                onClick={() => setIsOpen((currentValue) => !currentValue)}
            >
                <span className={!value ? 'date-picker-placeholder' : ''}>
                    {value ? formatDateLabel(value) : 'Seleccionar fecha'}
                </span>
                <span className="material-icons-outlined" aria-hidden="true">calendar_month</span>
            </button>

            {isOpen && (
                <div id={`${id}Calendar`} className="date-picker-popover" role="dialog" aria-label="Calendario">
                    <div className="date-picker-header">
                        <button type="button" className="date-picker-nav" onClick={() => moveMonth(-1)} aria-label="Mes anterior">
                            <span className="material-icons-outlined">chevron_left</span>
                        </button>
                        <strong>{monthLabel}</strong>
                        <button type="button" className="date-picker-nav" onClick={() => moveMonth(1)} aria-label="Mes siguiente">
                            <span className="material-icons-outlined">chevron_right</span>
                        </button>
                    </div>

                    <div className="date-picker-weekdays" aria-hidden="true">
                        {WEEKDAY_LABELS.map((day) => <span key={day}>{day}</span>)}
                    </div>

                    <div className="date-picker-grid">
                        {calendarDays.map((date) => {
                            const dateValue = toISODate(date);
                            const isCurrentMonth = date.getMonth() === viewMonth;
                            const isSelected = dateValue === value;
                            const isToday = dateValue === toISODate(today);
                            const isAfterMax = max && dateValue > max;

                            return (
                                <button
                                    type="button"
                                    key={dateValue}
                                    className={`date-picker-day ${!isCurrentMonth ? 'outside-month' : ''} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${isAfterMax ? 'disabled' : ''}`.trim()}
                                    disabled={isAfterMax}
                                    aria-label={date.toLocaleDateString('es-MX', { dateStyle: 'full' })}
                                    aria-pressed={isSelected}
                                    onClick={() => selectDate(date)}
                                >
                                    {date.getDate()}
                                </button>
                            );
                        })}
                    </div>

                    <div className="date-picker-footer">
                        {clearable && (
                            <button type="button" className="date-picker-footer-action" onClick={clearDate}>Limpiar</button>
                        )}
                        <button
                            type="button"
                            className="date-picker-footer-action primary"
                            disabled={Boolean(max && toISODate(today) > max)}
                            onClick={() => selectDate(today)}
                        >
                            Hoy
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DatePicker;
