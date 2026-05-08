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

  it("should not reveal cards when intersection observer reports not intersecting", () => {
    // Arrange
    render(<ProjectsWriting />);

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

  it("should render TheMarginCall project with demo link", () => {
    // Arrange
    render(<ProjectsWriting />);

    // Act
    const demoLinks = screen.getAllByRole("link", { name: /demo/i });

    // Assert
    const theMarginCallDemoLink = demoLinks.find(
      (link) => link.getAttribute("href") === "https://www.youtube.com/watch?v=uLtMD3J4U40"
    );
    expect(theMarginCallDemoLink).toBeTruthy();
    expect(theMarginCallDemoLink).toHaveAttribute("href", "https://www.youtube.com/watch?v=uLtMD3J4U40");
  });

  it("should render Illumina project with USD 9M cost savings highlight", () => {
    // Arrange
    render(<ProjectsWriting />);

    // Act
    const highlight = screen.getByText(/anticipated cost savings upon full deployment/i);
    const costSavingsAmount = screen.getByText(/\$9M/);

    // Assert
    expect(highlight).toBeInTheDocument();
    expect(costSavingsAmount).toBeInTheDocument();
  });

  it("should render all three projects as flagship cards", () => {
    // Arrange
    render(<ProjectsWriting />);

    // Act
    const soloBuildBadges = screen.getAllByText(/solo build/i);

    // Assert
    expect(soloBuildBadges).toHaveLength(3);
  });

  it("should render open source contributions section", () => {
    // Arrange
    render(<ProjectsWriting />);

    // Act
    const openSourceHeading = screen.getByRole("heading", { name: /open source contributions/i });
    const llamaIndexLink = screen.getByRole("link", { name: /LlamaIndex integration with Microsoft LLMLingua2/i });

    // Assert
    expect(openSourceHeading).toBeInTheDocument();
    expect(llamaIndexLink).toHaveAttribute("href", "https://github.com/run-llama/llama_index/pull/17531#event-15980092263");
  });

  it("should render all six featured articles with correct titles", () => {
    // Arrange
    render(<ProjectsWriting />);

    // Act
    const articles = [
      "Agent Memory: The underrated superpower of agentic apps",
      "How to Train Your LLM: Low Rank Adaptation Finetuning using Unsloth!",
      "How to RAFT your LLM: Retrieval Augmented Finetuning using Unsloth!",
      "A second look at LangGraph: When \"Command-Send\" becomes \"common sense\"",
      "Helm Charts: The Multi-Server Orchestra Conductor",
      "A gentle introduction to LiteLLM",
    ];

    // Assert
    articles.forEach((title) => {
      expect(screen.getByText(title)).toBeInTheDocument();
    });
  });

  it("should render article links pointing to Medium", () => {
    // Arrange
    render(<ProjectsWriting />);

    // Act
    const articleLinks = screen.getAllByRole("link", { name: /read →/i });

    // Assert
    expect(articleLinks.length).toBe(6);
    articleLinks.forEach((link) => {
      expect(link.getAttribute("href")).toMatch(/^https:\/\/medium\.com/);
    });
  });

  it("should render 50+ published technical articles text", () => {
    // Arrange
    render(<ProjectsWriting />);

    // Act
    const publishedText = screen.getByText(/50\+ published technical articles/i);

    // Assert
    expect(publishedText).toBeInTheDocument();
  });

  it("should render featured by information", () => {
    // Arrange
    render(<ProjectsWriting />);

    // Act
    const featuredText = screen.getByText(/featured by:/i);

    // Assert
    expect(featuredText).toBeInTheDocument();
    expect(screen.getByText(/Singapore Management University, Unsloth, LlamaIndex, IBM, FlowerAI/)).toBeInTheDocument();
  });

  it("should render all project descriptions", () => {
    // Arrange
    render(<ProjectsWriting />);

    // Act & Assert
    expect(screen.getByText(/54-container template for scalable/i)).toBeInTheDocument();
    expect(screen.getByText(/agentic RAG system for enterprise field service/i)).toBeInTheDocument();
    expect(screen.getByText(/multi-agent investment guidance crew/i)).toBeInTheDocument();
  });

  it("should render key project tech tags", () => {
    // Arrange
    render(<ProjectsWriting />);

    // Act & Assert - use getAllByText when there might be duplicates
    expect(screen.getByText("LangGraph")).toBeInTheDocument();
    expect(screen.getByText("Postgres")).toBeInTheDocument();
    expect(screen.getAllByText("Qdrant").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("LlamaIndex").length).toBeGreaterThanOrEqual(1);
  });

  it("should render all open source contributions", () => {
    // Arrange
    render(<ProjectsWriting />);

    // Act & Assert
    expect(screen.getByRole("link", { name: /LlamaIndex integration with Microsoft LLMLingua2/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /LlamaIndex Gmail Tool bug fix/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Unsloth Retrieval Augmented Finetuning cookbook/i })).toBeInTheDocument();
  });
});
