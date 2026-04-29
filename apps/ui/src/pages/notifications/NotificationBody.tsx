import type { ComponentPropsWithoutRef } from "react";
import Markdown from "react-markdown";
import { Link } from "react-router";
import {
  parseResourceReference,
  resourceTypeToPath,
} from "@/lib/resourceReference";

const ALLOWED_ELEMENTS = ["p", "strong", "em", "a", "br"];

type LinkKind =
  | { kind: "internal"; to: string }
  | { kind: "external"; href: string }
  | null;

function classifyLink(url: string): LinkKind {
  if (!url) return null;
  const ref = parseResourceReference(url);
  if (ref) {
    return { kind: "internal", to: resourceTypeToPath(ref.type, ref.id) };
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return { kind: "external", href: url };
  }
  return null;
}

function urlTransform(url: string): string {
  return classifyLink(url) ? url : "";
}

function AnchorRenderer({ href, children }: ComponentPropsWithoutRef<"a">) {
  const link = href ? classifyLink(href) : null;
  if (link?.kind === "internal") {
    return (
      <Link to={link.to} className="underline">
        {children}
      </Link>
    );
  }
  if (link?.kind === "external") {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        {children}
      </a>
    );
  }
  return <>{children}</>;
}

type NotificationBodyProps = {
  body: string;
};

export function NotificationBody({ body }: NotificationBodyProps) {
  return (
    <div className="[&_p]:mb-2 [&_p:last-child]:mb-0">
      <Markdown
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        urlTransform={urlTransform}
        components={{ a: AnchorRenderer }}
      >
        {body}
      </Markdown>
    </div>
  );
}
