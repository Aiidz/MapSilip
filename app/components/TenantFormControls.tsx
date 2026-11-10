'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
} from 'react';
import { Icon } from './Icon';

// ---------------------------------------------------------------------------
// 1. Custom Dropdown Control
// ---------------------------------------------------------------------------

export type DropdownOption = {
  value: string;
  label: string;
};

export function TenantDropdown({
  name,
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  required = false,
  disabled = false,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const selected = options.find((opt) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: globalThis.MouseEvent) {
      if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) {
        detailsRef.current.removeAttribute('open');
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <details ref={detailsRef} className="tenant-custom-dropdown">
      <summary
        className="tenant-dropdown__summary"
        aria-haspopup="listbox"
        tabIndex={disabled ? -1 : 0}
      >
        <span className={selected ? 'tenant-dropdown__label' : 'tenant-dropdown__placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        <Icon name="chevron" className="tenant-dropdown__chevron" />
      </summary>
      <input type="hidden" name={name} value={value} required={required} />
      <div className="tenant-dropdown__menu" role="listbox">
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={isSelected}
              className={`tenant-dropdown__item${isSelected ? ' is-selected' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                onChange(option.value);
                detailsRef.current?.removeAttribute('open');
              }}
            >
              <span>{option.label}</span>
              {isSelected && <span className="tenant-dropdown__check" aria-hidden="true">✓</span>}
            </button>
          );
        })}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// 2. Dashed File Upload Dropzone Control
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TenantFileDropzone({
  name,
  accept,
  required = false,
  title = 'Choose file',
  subtitle = 'JPG, PNG or PDF up to 2MB',
  onChange,
}: {
  name: string;
  accept: string;
  required?: boolean;
  title?: string;
  subtitle?: string;
  onChange?: (file: File | null) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File | null) => {
      setSelectedFile(file);
      onChange?.(file);
    },
    [onChange]
  );

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    handleFile(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    if (file && inputRef.current) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      inputRef.current.files = dataTransfer.files;
      handleFile(file);
    }
  };

  const handleRemove = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    handleFile(null);
  };

  return (
    <div className="tenant-file-upload-container">
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        required={required && !selectedFile}
        className="tenant-file-input--hidden"
        onChange={onInputChange}
      />
      {selectedFile ? (
        <div className="tenant-file-selected-badge">
          <div className="tenant-file-info">
            <svg
              className="tenant-file-badge-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <div className="tenant-file-text">
              <strong className="tenant-file-name">{selectedFile.name}</strong>
              <span className="tenant-file-size">({formatFileSize(selectedFile.size)})</span>
            </div>
          </div>
          <button
            type="button"
            className="tenant-file-remove-button"
            onClick={handleRemove}
            aria-label={`Remove ${selectedFile.name}`}
          >
            Remove
          </button>
        </div>
      ) : (
        <div
          className={`tenant-dropzone${isDragOver ? ' is-dragover' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
        >
          <svg
            className="tenant-dropzone-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
          <span className="tenant-dropzone-title">{title}</span>
          <span className="tenant-dropzone-sub">{subtitle}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Interactive Calendar Date Picker Control
// ---------------------------------------------------------------------------

function formatDisplayDate(isoDate: string): string {
  if (!isoDate) return 'Select date';
  try {
    const [year, month, day] = isoDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return new Intl.DateTimeFormat('en-PH', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  } catch {
    return isoDate;
  }
}

export function CalendarDatePicker({
  name,
  value,
  onChange,
  minDate,
  required = false,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  minDate?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const initialDate = value ? new Date(value + 'T00:00:00') : new Date();
  const [viewYear, setViewYear] = useState(() => initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => initialDate.getMonth());

  useEffect(() => {
    function handleClickOutside(event: globalThis.MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const weekdayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const prevMonth = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Calendar day calculation
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;

  const selectDay = (day: number) => {
    const formatted = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(formatted);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="tenant-calendar-picker">
      <input type="hidden" name={name} value={value} required={required} />
      <button
        type="button"
        className="tenant-calendar-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="tenant-calendar-trigger__inner">
          <svg
            className="tenant-calendar-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
            <line x1="16" x2="16" y1="2" y2="6" />
            <line x1="8" x2="8" y1="2" y2="6" />
            <line x1="3" x2="21" y1="10" y2="10" />
          </svg>
          <span className="tenant-calendar-trigger__text">{formatDisplayDate(value)}</span>
        </span>
        <Icon name="chevron" className={`tenant-dropdown__chevron${open ? ' is-open' : ''}`} />
      </button>

      {open && (
        <div className="tenant-calendar-popover" role="dialog" aria-label="Choose date">
          <div className="tenant-calendar-header">
            <button
              type="button"
              className="tenant-calendar-nav-btn"
              onClick={prevMonth}
              aria-label="Previous month"
            >
              ‹
            </button>
            <strong className="tenant-calendar-title">
              {monthNames[viewMonth]} {viewYear}
            </strong>
            <button
              type="button"
              className="tenant-calendar-nav-btn"
              onClick={nextMonth}
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="tenant-calendar-grid">
            {weekdayNames.map((day) => (
              <span key={day} className="tenant-calendar-weekday" aria-label={day}>
                {day}
              </span>
            ))}

            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <span key={`empty-${i}`} className="tenant-calendar-day--empty" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(
                day
              ).padStart(2, '0')}`;
              const isSelected = dateStr === value;
              const isToday = dateStr === todayStr;
              const isDisabled = minDate ? dateStr < minDate : false;

              return (
                <button
                  type="button"
                  key={dateStr}
                  disabled={isDisabled}
                  className={`tenant-calendar-day${isSelected ? ' is-selected' : ''}${
                    isToday ? ' is-today' : ''
                  }`}
                  onClick={() => selectDay(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
