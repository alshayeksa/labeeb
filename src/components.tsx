import type { ReactNode } from "react";
import { Globe2 } from "lucide-react";
export function IconButton({
  label,
  children,
  onClick,
  disabled = false,
  active = false,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "selected" : ""}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function EmptyState({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Globe2;
  title: string;
  detail: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={30} />
      </span>
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
export function PageMark({ url }: { url: string }) {
  let letter = "↗";
  try {
    letter = new URL(url).hostname
      .replace(/^www\./, "")
      .charAt(0)
      .toUpperCase();
  } catch {
    /* inert fallback */
  }
  return (
    <span className="page-mark" aria-hidden="true">
      {letter}
    </span>
  );
}
