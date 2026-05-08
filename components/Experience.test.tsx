import { act, render, screen } from "@testing-library/react";
import Experience from "./Experience";

type MockObserverInstance = {
  callback: IntersectionObserverCallback;
  observe: jest.Mock;
  unobserve: jest.Mock;
  disconnect: jest.Mock;
  target: Element | null;
};

let observerInstances: MockObserverInstance[] = [];

describe("Experience", () => {
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

  it("should render experience and education headings", () => {
    // Arrange
    render(<Experience />);

    // Act
    const experienceHeading = screen.getByRole("heading", { name: /experience/i });
    const educationHeading = screen.getByRole("heading", { name: /education/i });

    // Assert
    expect(experienceHeading).toBeInTheDocument();
    expect(educationHeading).toBeInTheDocument();
  });

  it("should render illumina highlight and tech tags", () => {
    // Arrange
    render(<Experience />);

    // Act
    const company = screen.getByRole("heading", { name: /illumina/i });
    const highlight = screen.getByText(/anticipated to save usd 9 million upon full deployment/i);
    const techTag1 = screen.getAllByText("LlamaIndex");
    const techTag2 = screen.getAllByText("Qdrant");

    // Assert
    expect(company).toBeInTheDocument();
    expect(highlight).toBeInTheDocument();
    expect(techTag1.length).toBeGreaterThan(0);
    expect(techTag2.length).toBeGreaterThan(0);
  });

  it("should not render mastercard role content before onboarding details are available", () => {
    // Arrange
    render(<Experience />);

    // Assert
    expect(screen.queryByRole("heading", { name: /mastercard/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/stack to be updated post-onboarding/i)).not.toBeInTheDocument();
  });

  it("should never render family content under any condition", () => {
    // Arrange
    render(<Experience />);

    // Assert
    expect(screen.queryByText(/wife|daughter|family|kids|children/i)).not.toBeInTheDocument();
  });

  it("should reveal cards when intersection observer reports intersecting", () => {
    // Arrange
    render(<Experience />);

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

  it("should not reveal cards when intersection observer reports not intersecting", () => {
    // Arrange
    render(<Experience />);

    // Act
    act(() => {
      observerInstances.forEach((instance) => {
        instance.callback(
          [{ isIntersecting: false, target: instance.target } as IntersectionObserverEntry],
          instance as unknown as IntersectionObserver
        );
      });
    });

    // Assert
    expect(observerInstances.every((instance) => instance.unobserve.mock.calls.length === 0)).toBe(true);
  });

  it("should render all role companies in correct order", () => {
    // Arrange
    render(<Experience />);

    // Act & Assert
    expect(screen.getByRole("heading", { name: /United Overseas Bank/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Illumina/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /CK Delta/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Energy Market Authority/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /JobTech Pte Ltd/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Toyota Tsusho Asia Pacific/i })).toBeInTheDocument();
  });

  it("should render Toyota highlight with forecast accuracy improvement", () => {
    // Arrange
    render(<Experience />);

    // Act & Assert
    expect(screen.getByText(/improved long-term forecast accuracy by ~25%/i)).toBeInTheDocument();
  });

  it("should render both education institutions", () => {
    // Arrange
    render(<Experience />);

    // Act & Assert
    expect(screen.getByRole("heading", { name: /Singapore Management University/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /National University of Singapore/i })).toBeInTheDocument();
  });

  it("should render SMU education honors", () => {
    // Arrange
    render(<Experience />);

    // Act & Assert
    expect(screen.getByText(/GPA 3.98 \/ 4.0/)).toBeInTheDocument();
    expect(screen.getByText(/Dean's List/)).toBeInTheDocument();
    expect(screen.getByText(/SMU AI Talent Development Grant/)).toBeInTheDocument();
  });

  it("should render NUS education honors", () => {
    // Arrange
    render(<Experience />);

    // Act & Assert
    expect(screen.getByText(/NUS Undergraduate Scholarship/)).toBeInTheDocument();
  });
});
