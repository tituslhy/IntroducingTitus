import { render } from "@testing-library/react";
import type { ComponentType } from "react";
import { PAGE_TARGETS, SITE_PAGES, type SitePath } from "@/lib/profile";
import AboutPage from "./about/page";
import EducationPage from "./education/page";
import ExperiencePage from "./experience/page";
import ProjectsPage from "./projects/page";
import WritingPage from "./writing/page";

// The paper reads a pick from the link and moves the link with the App Router; these page tests render it outside a router.
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn() }),
  usePathname: () => '/writing',
  useSearchParams: () => new URLSearchParams(),
}))

// The copilot's show_on_page scrolls to a target id on the route the target names.
// This checks that each route really renders the ids it is given, and no one else's.
const PAGES: Record<SitePath, ComponentType> = {
  "/about": AboutPage,
  "/experience": ExperiencePage,
  "/education": EducationPage,
  "/projects": ProjectsPage,
  "/writing": WritingPage,
};

describe("route anchors match PAGE_TARGETS", () => {
  it.each(SITE_PAGES.map((p) => p.path))("%s renders every target that names it, and only those", (path) => {
    const Page = PAGES[path];
    const { container } = render(<Page />);
    const wanted = PAGE_TARGETS.filter((t) => t.path === path).map((t) => t.id);

    for (const id of wanted) {
      expect({ path, id, present: container.querySelector(`[id="${id}"]`) !== null }).toEqual({ path, id, present: true });
    }
    const elsewhere = PAGE_TARGETS.filter((t) => t.path !== path).map((t) => t.id);
    for (const id of elsewhere) {
      expect({ path, id, present: container.querySelector(`[id="${id}"]`) !== null }).toEqual({ path, id, present: false });
    }
  });

  it.each(SITE_PAGES.map((p) => p.path))("%s has no duplicate element ids", (path) => {
    const Page = PAGES[path];
    const { container } = render(<Page />);
    const ids = Array.from(container.querySelectorAll("[id]"), (el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
