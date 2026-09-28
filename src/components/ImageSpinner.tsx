import "./ImageSpinner.css";

export function ImageSpinner() {
  return (
    <span className="image-spinner" role="status" aria-label="Loading image">
      <span className="image-spinner-icon" aria-hidden />
    </span>
  );
}
