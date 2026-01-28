import React from "react";
import { cn } from "@/lib/utils";

export function TypographyH1({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="scroll-m-20 text-center text-4xl font-extrabold tracking-tight text-balance">
      {children}
    </h1>
  );
}

// Section/page subtitles like "Transports" subtitle
export function TypographyH2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="scroll-m-20 text-2xl font-semibold text-inherit">
      {children}
    </h2>
  );
}

// Card titles like transport name
export function TypographyH3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="scroll-m-20 text-xl font-semibold text-slate-900">
      {children}
    </h3>
  );
}

export function TypographyH4({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="scroll-m-20 text-lg font-semibold tracking-tight">
      {children}
    </h4>
  );
}

export function TypographyH5({ children }: { children: React.ReactNode }) {
  return (
    <h5 className="scroll-m-20 text-base font-semibold tracking-tight">
      {children}
    </h5>
  );
}

export function TypographyH6({ children }: { children: React.ReactNode }) {
  return (
    <h6 className="scroll-m-20 text-sm font-semibold tracking-tight">
      {children}
    </h6>
  );
}

// Default body text used in list/form descriptions
export function TypographyP({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-6 text-slate-600">{children}</p>;
}

export function TypographyBlockquote({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <blockquote className="mt-6 border-l-2 pl-6 italic">{children}</blockquote>
  );
}

export function TypographyLead({ children }: { children: React.ReactNode }) {
  return <p className="text-xl text-muted-foreground">{children}</p>;
}

export function TypographyLarge({ children }: { children: React.ReactNode }) {
  return <p className="text-lg font-semibold">{children}</p>;
}

// Small helper text
export function TypographySmall({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  return (
    <small className={cn("text-xs text-slate-500", className)} {...props}>
      {children}
    </small>
  );
}

export function TypographyMuted({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props}>
      {children}
    </p>
  );
}

// Uppercase "eyebrow" label like section / card overlines
export function TypographyEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium uppercase tracking-[0.3em] text-slate-500">
      {children}
    </p>
  );
}
