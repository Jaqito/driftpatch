import vm from "node:vm";
import type { ApiSurface, ElementSurface } from "./types.js";

interface CapturedDefinition {
  name: string;
  klass: unknown;
}

export function extractApiSurface(
  bundleText: string,
  sha: string,
  source: ApiSurface["source"] = "literal",
): ApiSurface {
  const captured: CapturedDefinition[] = [];
  const warnings: string[] = [];

  const sandbox = buildSandbox(captured, warnings);
  vm.createContext(sandbox);

  try {
    vm.runInContext(bundleText, sandbox, { timeout: 10_000 });
  } catch (err) {
    warnings.push(`bundle threw during evaluation: ${describe(err)}`);
  }

  const elements = new Map<string, ElementSurface>();
  for (const def of captured) {
    try {
      elements.set(def.name, introspectClass(def.name, def.klass, sandbox.HTMLElement));
    } catch (err) {
      warnings.push(`introspection failed for ${def.name}: ${describe(err)}`);
    }
  }

  return {
    buildSha: sha,
    source,
    elements,
    fetchedAt: new Date().toISOString(),
    extractionWarnings: warnings,
  };
}

function buildSandbox(
  captured: CapturedDefinition[],
  warnings: string[],
): Record<string, unknown> & { HTMLElement: unknown } {
  class EventTargetBase {
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {
      return true;
    }
  }
  class NodeBase extends EventTargetBase {
    appendChild() {}
    removeChild() {}
    insertBefore() {}
    contains() {
      return false;
    }
    cloneNode() {
      return this;
    }
  }
  class ElementBase extends NodeBase {
    setAttribute() {}
    getAttribute() {
      return null;
    }
    removeAttribute() {}
    hasAttribute() {
      return false;
    }
    toggleAttribute() {
      return false;
    }
    closest() {
      return null;
    }
    matches() {
      return false;
    }
    getBoundingClientRect() {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
    }
  }
  class HTMLElementBase extends ElementBase {
    attachShadow() {
      return {
        appendChild() {},
        querySelector() {
          return null;
        },
        querySelectorAll() {
          return [];
        },
        adoptedStyleSheets: [],
      };
    }
    focus() {}
    blur() {}
    click() {}
    remove() {}
  }
  class EventBase {
    constructor(public type: string) {}
  }
  class CustomEventBase extends EventBase {}
  class DocumentFragmentBase {
    appendChild() {}
  }
  class ShadowRootBase extends DocumentFragmentBase {}

  const fakeElement = (): unknown => ({
    appendChild() {},
    setAttribute() {},
    getAttribute() {
      return null;
    },
    style: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false;
      },
    },
    addEventListener() {},
    removeEventListener() {},
    children: [],
  });

  const fakeDocument = {
    createElement: () => fakeElement(),
    createElementNS: () => fakeElement(),
    createTextNode: () => fakeElement(),
    createDocumentFragment: () => fakeElement(),
    head: fakeElement(),
    body: fakeElement(),
    documentElement: fakeElement(),
    addEventListener() {},
    removeEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    adoptedStyleSheets: [],
  };

  class DocumentBase extends NodeBase {
    createElement = fakeElement;
    createElementNS = fakeElement;
    createTextNode = fakeElement;
    createComment = fakeElement;
    createDocumentFragment = fakeElement;
    createRange() {
      return { setStart() {}, setEnd() {}, collapse() {} };
    }
    querySelector() {
      return null;
    }
    querySelectorAll() {
      return [];
    }
    getElementById() {
      return null;
    }
    getElementsByTagName() {
      return [];
    }
  }

  class HTMLDocumentBase extends DocumentBase {}

  function makeStubClass(): new () => unknown {
    return class {} as new () => unknown;
  }

  const sandbox: Record<string, unknown> & { HTMLElement: unknown } = {
    EventTarget: EventTargetBase,
    Node: NodeBase,
    Element: ElementBase,
    HTMLElement: HTMLElementBase,
    SVGElement: class extends ElementBase {},
    Document: DocumentBase,
    HTMLDocument: HTMLDocumentBase,
    Text: class extends NodeBase {},
    Comment: class extends NodeBase {},
    HTMLDivElement: class extends HTMLElementBase {},
    HTMLSpanElement: class extends HTMLElementBase {},
    HTMLButtonElement: class extends HTMLElementBase {},
    HTMLInputElement: class extends HTMLElementBase {},
    HTMLAnchorElement: class extends HTMLElementBase {},
    HTMLImageElement: class extends HTMLElementBase {},
    HTMLTemplateElement: class extends HTMLElementBase {
      content = { cloneNode: () => ({}) };
    },
    HTMLSlotElement: class extends HTMLElementBase {},
    HTMLBodyElement: class extends HTMLElementBase {},
    HTMLHeadElement: class extends HTMLElementBase {},
    HTMLStyleElement: class extends HTMLElementBase {},
    HTMLScriptElement: class extends HTMLElementBase {},
    Event: EventBase,
    CustomEvent: CustomEventBase,
    KeyboardEvent: class extends EventBase {},
    MouseEvent: class extends EventBase {},
    PointerEvent: class extends EventBase {},
    FocusEvent: class extends EventBase {},
    InputEvent: class extends EventBase {},
    DocumentFragment: DocumentFragmentBase,
    ShadowRoot: ShadowRootBase,
    AbortController: makeStubClass(),
    AbortSignal: makeStubClass(),
    File: makeStubClass(),
    FileList: makeStubClass(),
    FileReader: makeStubClass(),
    Blob: makeStubClass(),
    FormData: makeStubClass(),
    Image: class extends HTMLElementBase {},
    XMLHttpRequest: class extends EventTargetBase {
      open() {}
      send() {}
      setRequestHeader() {}
      abort() {}
    },
    fetch: () => Promise.reject(new Error("fetch not available in extractor sandbox")),
    Response: makeStubClass(),
    Request: makeStubClass(),
    Headers: class {
      append() {}
      get() {
        return null;
      }
      set() {}
    },
    URL,
    URLSearchParams,
    document: fakeDocument,
    customElements: {
      define(name: string, klass: unknown) {
        captured.push({ name, klass });
      },
      get() {
        return undefined;
      },
      whenDefined() {
        return Promise.resolve();
      },
      upgrade() {},
    },
    CSSStyleSheet: class {
      replaceSync() {}
      replace() {
        return Promise.resolve();
      }
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    IntersectionObserver: class {
      observe() {}
      disconnect() {}
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    matchMedia: () => ({
      matches: false,
      media: "",
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    }),
    requestAnimationFrame: (cb: () => void) => {
      void cb;
      return 0;
    },
    cancelAnimationFrame: () => {},
    queueMicrotask: (cb: () => void) => {
      void cb;
    },
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    console: {
      log: () => {},
      warn: (msg: unknown) => warnings.push(`bundle console.warn: ${describe(msg)}`),
      error: (msg: unknown) => warnings.push(`bundle console.error: ${describe(msg)}`),
    },
    navigator: { userAgent: "node-vm" },
    location: { href: "https://driftpatch.local/", protocol: "https:" },
  };
  sandbox["window"] = sandbox;
  sandbox["self"] = sandbox;
  sandbox["globalThis"] = sandbox;
  return sandbox;
}

const INHERITED_METHODS_TO_SKIP = new Set([
  "addEventListener",
  "removeEventListener",
  "dispatchEvent",
  "appendChild",
  "removeChild",
  "insertBefore",
  "contains",
  "cloneNode",
  "setAttribute",
  "getAttribute",
  "removeAttribute",
  "hasAttribute",
  "toggleAttribute",
  "closest",
  "matches",
  "getBoundingClientRect",
  "attachShadow",
  "focus",
  "blur",
  "click",
  "remove",
]);

function introspectClass(
  name: string,
  klassRaw: unknown,
  baseClass: unknown,
): ElementSurface {
  if (typeof klassRaw !== "function") {
    return { name, observedAttributes: [], properties: [], methods: [] };
  }
  const klass = klassRaw as { observedAttributes?: unknown; prototype?: object };
  const observedAttributes = Array.isArray(klass.observedAttributes)
    ? klass.observedAttributes.filter((x): x is string => typeof x === "string")
    : [];

  const propNames = new Set<string>();
  const methodNames = new Set<string>();

  let proto: object | null = klass.prototype ?? null;
  const baseProto =
    typeof baseClass === "function" && (baseClass as { prototype?: object }).prototype
      ? (baseClass as { prototype: object }).prototype
      : null;

  while (proto && proto !== Object.prototype && proto !== baseProto) {
    for (const propName of Object.getOwnPropertyNames(proto)) {
      if (propName === "constructor") continue;
      const desc = Object.getOwnPropertyDescriptor(proto, propName);
      if (!desc) continue;
      if (desc.get || desc.set) {
        propNames.add(propName);
      } else if (typeof desc.value === "function") {
        if (!INHERITED_METHODS_TO_SKIP.has(propName)) {
          methodNames.add(propName);
        }
      }
    }
    proto = Object.getPrototypeOf(proto);
  }

  return {
    name,
    observedAttributes: dedupeSorted(observedAttributes),
    properties: dedupeSorted([...propNames]),
    methods: dedupeSorted([...methodNames]),
  };
}

function dedupeSorted(arr: string[]): string[] {
  return Array.from(new Set(arr)).sort();
}

function describe(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
