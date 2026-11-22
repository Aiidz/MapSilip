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
        aria-disabled={disabled}
        onClick={event => { if (disabled) event.preventDefault(); }}
      >
        <span className={selected ? 'tenant-dropdown__label' : 'tenant-dropdown__placeholder'}>
          {selected ? selected.label : placeholder}
        </span>
        <Icon name="chevron" className="tenant-dropdown__chevron" />
      </summary>
      <select className="sr-only" name={name} value={value} required={required} disabled={disabled} aria-label={placeholder} onChange={event => onChange(event.target.value)}><option value="">{placeholder}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      <div className="tenant-dropdown__menu" role="listbox">
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <button
              type="button"
              key={option.value}
              role="option"
              disabled={disabled}
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
  subtitle = 'Images optimized automatically · PDF up to 2 MB',
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
