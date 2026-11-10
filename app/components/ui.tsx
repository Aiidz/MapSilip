import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="page-header__action">{action}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  description,
  icon,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  icon?: IconName;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel__header">
        <div className="panel__heading">
          {icon
            ? (
              <span className="panel__icon">
                <Icon name={icon} />
              </span>
            )
            : null}
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}

export function StatusBadge(
  { children, tone = "neutral" }: {
    children: ReactNode;
    tone?: "neutral" | "info" | "warning" | "success";
  },
) {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      <span aria-hidden="true" className="status-badge__dot" />
      {children}
    </span>
  );
}

export function PreviewNote(
  { children = "This information is unavailable." }: {
    children?: ReactNode;
  },
) {
  return (
    <div className="preview-note">
      <span className="preview-note__dot" aria-hidden="true" />
      {children}
    </div>
  );
}

export function EmptyState(
  { title, description, icon = "sparkles" }: {
    title: string;
    description?: string;
    icon?: IconName;
  },
) {
  return (
    <div className="empty-state">
      {icon ? (
        <span className="empty-state__icon">
          <Icon name={icon} />
        </span>
      ) : null}
      <div>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
    </div>
  );
}

export function PreviewLink(
  { href, children, subtle = false }: {
    href: string;
    children: ReactNode;
    subtle?: boolean;
  },
) {
  return (
    <Link
      className={`text-link${subtle ? " text-link--subtle" : ""}`}
      href={href}
    >
      {children}
      <Icon name="arrow" />
    </Link>
  );
}

export function PreviewCard({
  title,
  description,
  href,
  icon,
}: {
  title: string;
  description?: string;
  href: string;
  icon: IconName;
}) {
  return (
    <Link className="preview-card" href={href}>
      <span className="preview-card__icon">
        <Icon name={icon} />
      </span>
      <span className="preview-card__copy">
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </span>
      <Icon name="chevron" className="preview-card__chevron" />
    </Link>
  );
}

export function StatPanel(
  { label, value = "—", detail }: {
    label: string;
    value?: string;
    detail: string;
  },
) {
  return (
    <section className="stat-panel">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </section>
  );
}
