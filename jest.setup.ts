import "@testing-library/jest-dom";

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => {
    const React = require("react");
    // next/image's boolean-only props (fill, priority) are not DOM attributes; drop them.
    const { fill: _fill, priority: _priority, ...rest } = props;
    return React.createElement("img", { ...rest, alt: rest.alt ?? "" });
  },
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => {
    const React = require("react");
    return React.createElement("a", { href, ...rest }, children);
  },
}));

// react-markdown (and its remark plugins) ship as ESM, which Jest's default
// transform doesn't process. Tests that pull in CopilotBubble transitively
// (e.g. layout/page) would crash on `Unexpected token 'export'`. Mock globally
// to render children as plain text; per-file mocks still override this.
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => {
    const React = require("react");
    return React.createElement("div", null, children);
  },
}));

jest.mock("remark-gfm", () => ({
  __esModule: true,
  default: () => {},
}));

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver;

// jsdom doesn't implement scrollIntoView; CopilotBubble calls it in an effect.
// Guarded so the node test environment (where Element is undefined) is unaffected.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = jest.fn();
}

// jsdom doesn't implement window.matchMedia; usePrefersReducedMotion hook calls it.
// Guarded so the node test environment (where window is undefined) is unaffected.
if (typeof window !== "undefined") {
  class MediaQueryListMock implements MediaQueryList {
    matches = false;
    media = "";
    onchange: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null = null;
    addListener = jest.fn();
    removeListener = jest.fn();
    addEventListener = jest.fn();
    removeEventListener = jest.fn();
    dispatchEvent = jest.fn(() => true);
  }

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn((_query: string) => new MediaQueryListMock()),
  });
}
