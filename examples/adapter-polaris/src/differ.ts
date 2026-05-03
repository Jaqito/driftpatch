import { createHash } from "node:crypto";
import type { ChangeEvent } from "@driftpatch/core";
import type { ApiSurface, ElementSurface } from "./types.js";

export interface DiffOptions {
  fromVersion: string;
  toVersion: string;
}

export function diffSurfaces(
  from: ApiSurface,
  to: ApiSurface,
  opts: DiffOptions,
): ChangeEvent[] {
  const events: ChangeEvent[] = [];
  const fromNames = new Set(from.elements.keys());
  const toNames = new Set(to.elements.keys());

  for (const name of toNames) {
    if (!fromNames.has(name)) {
      events.push(makeEvent("addition", name, `Element ${name} added`, "low", opts));
    }
  }
  for (const name of fromNames) {
    if (!toNames.has(name)) {
      events.push(makeEvent("removal", name, `Element ${name} removed`, "high", opts));
    }
  }

  for (const name of toNames) {
    if (!fromNames.has(name)) continue;
    const fromEl = from.elements.get(name);
    const toEl = to.elements.get(name);
    if (!fromEl || !toEl) continue;
    events.push(...diffElement(name, fromEl, toEl, opts));
  }

  return events;
}

function diffElement(
  elementName: string,
  from: ElementSurface,
  to: ElementSurface,
  opts: DiffOptions,
): ChangeEvent[] {
  const events: ChangeEvent[] = [];

  diffSet(
    from.observedAttributes,
    to.observedAttributes,
    (added) => {
      for (const a of added) {
        events.push(
          makeEvent(
            "addition",
            `${elementName}[${a}]`,
            `Attribute \`${a}\` added to \`${elementName}\``,
            "low",
            opts,
            { element: elementName, attribute: a },
          ),
        );
      }
    },
    (removed) => {
      for (const a of removed) {
        events.push(
          makeEvent(
            "removal",
            `${elementName}[${a}]`,
            `Attribute \`${a}\` removed from \`${elementName}\``,
            "high",
            opts,
            { element: elementName, attribute: a },
          ),
        );
      }
    },
  );

  diffSet(
    from.properties,
    to.properties,
    (added) => {
      for (const p of added) {
        events.push(
          makeEvent(
            "addition",
            `${elementName}.${p}`,
            `Property \`${p}\` added to \`${elementName}\``,
            "low",
            opts,
            { element: elementName, property: p },
          ),
        );
      }
    },
    (removed) => {
      for (const p of removed) {
        events.push(
          makeEvent(
            "removal",
            `${elementName}.${p}`,
            `Property \`${p}\` removed from \`${elementName}\``,
            "high",
            opts,
            { element: elementName, property: p },
          ),
        );
      }
    },
  );

  diffSet(
    from.methods,
    to.methods,
    (added) => {
      for (const m of added) {
        events.push(
          makeEvent(
            "addition",
            `${elementName}.${m}()`,
            `Method \`${m}()\` added to \`${elementName}\``,
            "low",
            opts,
            { element: elementName, method: m },
          ),
        );
      }
    },
    (removed) => {
      for (const m of removed) {
        events.push(
          makeEvent(
            "removal",
            `${elementName}.${m}()`,
            `Method \`${m}()\` removed from \`${elementName}\``,
            "medium",
            opts,
            { element: elementName, method: m },
          ),
        );
      }
    },
  );

  return events;
}

function diffSet(
  from: string[],
  to: string[],
  onAdded: (added: string[]) => void,
  onRemoved: (removed: string[]) => void,
): void {
  const fromSet = new Set(from);
  const toSet = new Set(to);
  const added = to.filter((x) => !fromSet.has(x)).sort();
  const removed = from.filter((x) => !toSet.has(x)).sort();
  if (added.length > 0) onAdded(added);
  if (removed.length > 0) onRemoved(removed);
}

function makeEvent(
  kind: ChangeEvent["kind"],
  entity: string,
  description: string,
  risk: ChangeEvent["risk"],
  opts: DiffOptions,
  attributes?: Record<string, unknown>,
): ChangeEvent {
  const id = createHash("sha1")
    .update(`polaris|${kind}|${entity}|${opts.fromVersion}|${opts.toVersion}`)
    .digest("hex")
    .slice(0, 16);
  return {
    id,
    provider: "polaris",
    kind,
    entity,
    fromVersion: opts.fromVersion,
    toVersion: opts.toVersion,
    description,
    attributes,
    risk,
  };
}
