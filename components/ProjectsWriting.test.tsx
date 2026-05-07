import { act, render, screen } from "@testing-library/react";
import ProjectsWriting from "./ProjectsWriting";

type MockObserverInstance = {
  callback: IntersectionObserverCallback;
  observe: jest.Mock;
  unobserve: jest.Mock;
  disconnect: jest.Mock;
  target: Element | null;
};

let observerInstances: MockObserverInstance[] = [];

describe("ProjectsWriting", () => {
  beforeEach(() => {
    observerInstances = [];

    class MockIntersectionObserver {
      callback: IntersectionObserverCallback;
      observe = jest.fn((target: Element) => {
        this.target = target;
      });
      unobserve = jest.fn();
      disconnect = jest.fn();
      target: Element | null = null;

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        observerInstances.push(this as unknown as MockObserverInstance);
      }
    }

    global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  it("should render projects and writing section headings", () => {
    // Arrange
    render(<ProjectsWriting />);

    // Assert
    expect(screen.getByRole("heading", { name: /projects/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /writing/i })).toBeInTheDocument();
  });

  it("should render flagship fictional-bassoon project with github link", () => {
    // Arrange
    render(<ProjectsWriting />);

    // Act
    const projectHeading = screen.getByRole("heading", { name: /fictional-bassoon/i });
    const soloBuildBadges = screen.getAllByText(/solo build/i);
    const githubLinks = screen.getAllByRole("link", { name: /github/i });

    // Assert
    expect(projectHeading).toBeInTheDocument();
    expect(soloBuildBadges.length).toBeGreaterThan(0);
    const fictionalBassoonLink = githubLinks.find((link) => link.getAttribute("href") === "https://github.com/tituslhy/fictional-bassoon");
    expect(fictionalBassoonLink).toBeTruthy();
    expect(fictionalBassoonLink).toHaveAttribute("href", "https://github.com/tituslhy/fictional-bassoon");
  });

  it("should render six featured medium articles and all-articles link", () => {
    // Arrange
    render(<ProjectsWriting />);

    // Act
    const mediumCards = screen.getAllByText("Medium");
    const allArticlesLink = screen.getByRole("link", { name: /view all articles on medium/i });

    // Assert
    expect(mediumCards).toHaveLength(6);
    expect(allArticlesLink).toHaveAttribute("href", "https://medium.com/@tituslhy");
  });

  it("should reveal cards when intersection observer reports intersecting", () => {
    // Arrange
    render(<ProjectsWriting />);

    // Act
    act(() => {
      observerInstances.forEach((instance) => {
        instance.callback(
          [{ isIntersecting: true, target: instance.target } as IntersectionObserverEntry],
          instance as unknown as IntersectionObserver
        );
      });
    });

    // Assert
    expect(observerInstances.some((instance) => instance.unobserve.mock.calls.length > 0)).toBe(true);
  });
});
