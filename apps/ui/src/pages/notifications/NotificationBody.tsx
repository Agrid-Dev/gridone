import { Fragment, type ComponentPropsWithoutRef } from "react";
import Markdown from "react-markdown";
import { Link } from "react-router";
import {
  parseResourceReference,
  resourceTypeToPath,
} from "@/lib/resourceReference";

const ALLOWED_ELEMENTS = ["p", "strong", "em", "a", "br"];
const ALLOWED_LINK_PREFIXES = ["http://", "https://", "resource://"];

function urlTransform(url: string): string {
  return ALLOWED_LINK_PREFIXES.some((prefix) => url.startsWith(prefix))
    ? url
    : "";
}

function AnchorRenderer({ href, children }: ComponentPropsWithoutRef<"a">) {
  if (href) {
    const ref = parseResourceReference(href);
    if (ref) {
      return (
        <Link to={resourceTypeToPath(ref.type, ref.id)} className="underline">
          {children}
        </Link>
      );
    }
    if (href.startsWith("http://") || href.startsWith("https://")) {
      return (
        <a href={href} target="_blank" rel="noreferrer" className="underline">
          {children}
        </a>
      );
    }
  }
  return <>{children}</>;
}

function ParagraphRenderer({ children }: ComponentPropsWithoutRef<"p">) {
  return <Fragment>{children}</Fragment>;
}

type NotificationBodyProps = {
  body: string;
};

export function NotificationBody({ body }: NotificationBodyProps) {
  return (
    <Markdown
      allowedElements={ALLOWED_ELEMENTS}
      unwrapDisallowed
      urlTransform={urlTransform}
      components={{ a: AnchorRenderer, p: ParagraphRenderer }}
    >
      {body}
    </Markdown>
  );
}
