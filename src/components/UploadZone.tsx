import { useRef, useState } from 'react';

type UploadZoneProps = {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
};

export default function UploadZone({ onFileSelected, isLoading }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      onFileSelected(file);
    }
  };

  return (
    <section className="upload-section">
      <div
        className={`upload-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <h2>Upload Turo CSV</h2>
        <p>Drop your file here or click to select.</p>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={isLoading}>
          {isLoading ? 'Processing...' : 'Choose CSV'}
        </button>
        <input
          ref={inputRef}
          className="hidden-input"
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onFileSelected(file);
            }
          }}
        />
      </div>
    </section>
  );
}
