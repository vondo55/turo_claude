import { useMemo, useState } from 'react';

type MultiSelectFilterProps = {
  label: string;
  options: string[];
  selectedValues: string[];
  onChange: (nextValues: string[]) => void;
  placeholder: string;
};

export default function MultiSelectFilter({
  label,
  options,
  selectedValues,
  onChange,
  placeholder,
}: MultiSelectFilterProps) {
  const [query, setQuery] = useState('');

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => option.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  function toggleValue(value: string) {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((item) => item !== value));
      return;
    }
    onChange([...selectedValues, value]);
  }

  function summaryText() {
    if (selectedValues.length === 0) return placeholder;
    if (selectedValues.length === 1) return selectedValues[0];
    return `${selectedValues.length} selected`;
  }

  return (
    <div className="multi-select">
      <span className="multi-select-label">{label}</span>
      <details className="multi-select-menu">
        <summary>{summaryText()}</summary>
        <div className="multi-select-panel">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${label.toLowerCase()}...`}
          />
          <div className="multi-select-list">
            {filteredOptions.map((option) => (
              <label key={option} className="multi-select-option">
                <input type="checkbox" checked={selectedValues.includes(option)} onChange={() => toggleValue(option)} />
                <span>{option}</span>
              </label>
            ))}
            {filteredOptions.length === 0 ? <p className="multi-select-empty">No matches found.</p> : null}
          </div>
          {selectedValues.length > 0 ? (
            <button type="button" className="multi-select-clear" onClick={() => onChange([])}>
              Clear all
            </button>
          ) : null}
        </div>
      </details>
    </div>
  );
}
