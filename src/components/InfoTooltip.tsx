import type { ReactNode } from "react";
import "./InfoTooltip.css";

interface InfoTooltipProps {
  children: ReactNode;
}

export function InfoTooltip({ children }: InfoTooltipProps) {
  return (
    <span className="info-tooltip">
      <button
        type="button"
        className="info-tooltip-btn"
        aria-label="More information"
        onClick={(event) => event.preventDefault()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        i
      </button>
      <span className="info-tooltip-panel" role="tooltip">
        {children}
      </span>
    </span>
  );
}
