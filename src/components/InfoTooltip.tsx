import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./InfoTooltip.css";

interface InfoTooltipProps {
  children: ReactNode;
}

const PANEL_WIDTH = 240;
const MARGIN = 8;

export function InfoTooltip({ children }: InfoTooltipProps) {
  const tooltipId = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef(0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const place = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const panelH = panelRef.current?.offsetHeight ?? 0;
    let left = rect.right - PANEL_WIDTH;
    if (left < MARGIN) left = MARGIN;
    if (left + PANEL_WIDTH > window.innerWidth - MARGIN) {
      left = Math.max(MARGIN, window.innerWidth - PANEL_WIDTH - MARGIN);
    }
    let top = rect.bottom + MARGIN;
    if (panelH && top + panelH > window.innerHeight - MARGIN) {
      top = Math.max(MARGIN, rect.top - panelH - MARGIN);
    }
    setPos({ top, left });
  };

  const show = () => {
    window.clearTimeout(hideTimer.current);
    const btn = btnRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setPos({
        top: rect.bottom + MARGIN,
        left: Math.max(MARGIN, Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - MARGIN)),
      });
    }
    setOpen(true);
  };

  const hide = () => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setOpen(false), 160);
  };

  useEffect(() => {
    if (!open) return undefined;
    place();
    const onReposition = () => place();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, children]);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  return (
    <span className="info-tooltip" onMouseEnter={show} onMouseLeave={hide}>
      <button
        ref={btnRef}
        type="button"
        className="info-tooltip-btn"
        aria-label="More information"
        aria-describedby={open ? tooltipId : undefined}
        onClick={(event) => event.preventDefault()}
        onPointerDown={(event) => event.stopPropagation()}
        onFocus={show}
        onBlur={hide}
      >
        i
      </button>
      {open
        ? createPortal(
            <span
              ref={panelRef}
              id={tooltipId}
              className="info-tooltip-panel"
              role="tooltip"
              style={{ top: pos.top, left: pos.left }}
              onMouseEnter={show}
              onMouseLeave={hide}
            >
              {children}
            </span>,
            document.body
          )
        : null}
    </span>
  );
}
