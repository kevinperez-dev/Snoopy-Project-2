// Propósito: selector reutilizable con lista legible, scroll y comportamiento consistente.

import { useEffect, useRef, useState } from 'react';

function SelectDropdown({
    id,
    value,
    options = [],
    onChange,
    disabled = false,
    ariaLabel,
    ariaDescribedBy,
}) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);
    const listboxId = `${id}Options`;
    const selectedOption = options.find((option) => String(option.value) === String(value)) || options[0];

    const isMenuVisible = isOpen && !disabled;

    useEffect(() => {
        if (!isMenuVisible) return undefined;

        const handlePointerDown = (event) => {
            if (!containerRef.current?.contains(event.target)) {
                setIsOpen(false);
            }
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isMenuVisible]);

    const handleOptionClick = (option) => {
        onChange({ target: { value: String(option.value) } });
        setIsOpen(false);
    };

    const handleTriggerKeyDown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setIsOpen((currentValue) => !currentValue);
        }
    };

    return (
        <div
            ref={containerRef}
            className={`custom-select-dropdown ${isMenuVisible ? 'is-open' : ''}`.trim()}
        >
            <button
                id={id}
                type="button"
                className="filter-control custom-select-trigger"
                aria-label={ariaLabel}
                aria-describedby={ariaDescribedBy}
                aria-haspopup="listbox"
                aria-expanded={isMenuVisible}
                aria-controls={listboxId}
                disabled={disabled}
                onClick={() => setIsOpen((currentValue) => !currentValue)}
                onKeyDown={handleTriggerKeyDown}
            >
                <span>{selectedOption?.label || ''}</span>
                <span className="material-icons-outlined" aria-hidden="true">expand_more</span>
            </button>

            {isMenuVisible && (
                <div id={listboxId} className="custom-select-options" role="listbox" aria-label={ariaLabel}>
                    {options.map((option) => (
                        <button
                            key={String(option.value)}
                            type="button"
                            role="option"
                            aria-selected={String(option.value) === String(value)}
                            className="custom-select-option"
                            onClick={() => handleOptionClick(option)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default SelectDropdown;
