import "@testing-library/jest-dom";

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    const React = require("react");
    return React.createElement("img", { ...props, alt: props.alt ?? "" });
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
