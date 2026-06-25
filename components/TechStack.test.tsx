import { render, screen } from "@testing-library/react";
import TechStack from "./TechStack";

describe("TechStack", () => {
  it("should render section with stack id", () => {
    const { container } = render(<TechStack />);
    const section = container.querySelector("section#stack");
    expect(section).toBeInTheDocument();
  });

  it("should render section heading with correct text", () => {
    render(<TechStack />);
    const heading = screen.getByRole("heading", { name: /what i work with/i });
    expect(heading).toBeInTheDocument();
  });

  it("should render section subtitle about tools", () => {
    render(<TechStack />);
    const subtitle = screen.getByText(/tools, not religions/i);
    expect(subtitle).toBeInTheDocument();
  });

  it("should render all stack category group labels", () => {
    render(<TechStack />);
    expect(screen.getByText("AI / GenAI Frameworks")).toBeInTheDocument();
    expect(screen.getByText("Languages")).toBeInTheDocument();
    expect(screen.getByText("Infrastructure")).toBeInTheDocument();
    expect(screen.getByText("Databases")).toBeInTheDocument();
    expect(screen.getByText("Observability")).toBeInTheDocument();
    expect(screen.getByText("Cloud")).toBeInTheDocument();
  });

  it("should render representative technologies from AI/GenAI Frameworks", () => {
    render(<TechStack />);
    expect(screen.getByText("LangChain")).toBeInTheDocument();
    expect(screen.getByText("LangGraph")).toBeInTheDocument();
    expect(screen.getByText("LlamaIndex")).toBeInTheDocument();
    expect(screen.getByText("CrewAI")).toBeInTheDocument();
  });

  it("should render languages with proficiency levels", () => {
    render(<TechStack />);
    expect(screen.getByText("Python ◆ Expert")).toBeInTheDocument();
    expect(screen.getByText("SQL ◆ Expert")).toBeInTheDocument();
    expect(screen.getByText("Java ◆ Proficient")).toBeInTheDocument();
  });

  it("should render infrastructure technologies", () => {
    render(<TechStack />);
    expect(screen.getByText("Docker")).toBeInTheDocument();
    expect(screen.getByText("Kubernetes / Helm")).toBeInTheDocument();
    expect(screen.getByText("GitHub Actions")).toBeInTheDocument();
  });

  it("should render database technologies", () => {
    render(<TechStack />);
    expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
    expect(screen.getByText("MongoDB")).toBeInTheDocument();
    expect(screen.getByText("Redis")).toBeInTheDocument();
  });

  it("should render observability tools", () => {
    render(<TechStack />);
    expect(screen.getByText("Grafana")).toBeInTheDocument();
    expect(screen.getByText("Prometheus")).toBeInTheDocument();
    expect(screen.getByText("Langfuse")).toBeInTheDocument();
  });

  it("should render cloud platforms", () => {
    render(<TechStack />);
    expect(screen.getByText("AWS")).toBeInTheDocument();
    expect(screen.getByText("GCP")).toBeInTheDocument();
    expect(screen.getByText("Azure")).toBeInTheDocument();
  });

  it("should render section marker with stack label", () => {
    render(<TechStack />);
    expect(screen.getByText("Stack")).toBeInTheDocument();
  });

  it("should render amber-colored 'work with' text in heading", () => {
    const { container } = render(<TechStack />);
    const emElement = container.querySelector("h2 em");
    expect(emElement).toHaveClass("text-amber");
    expect(emElement).toHaveClass("italic");
  });

  it("should render stack groups in grid layout", () => {
    const { container } = render(<TechStack />);
    const gridContainer = container.querySelector(".grid");
    expect(gridContainer).toHaveClass("grid-cols-[repeat(auto-fit,minmax(240px,1fr))]");
  });

  it("should render all 8 AI/GenAI framework items", () => {
    render(<TechStack />);
    const frameworks = ["LangChain", "LangGraph", "LlamaIndex", "CrewAI", "Autogen", "DSPy", "MCP", "A2A"];
    frameworks.forEach(framework => {
      expect(screen.getByText(framework)).toBeInTheDocument();
    });
  });

  it("should render all 6 database items", () => {
    render(<TechStack />);
    const databases = ["PostgreSQL", "Oracle DB", "Redis", "MongoDB", "Qdrant", "Neo4j"];
    databases.forEach(db => {
      expect(screen.getByText(db)).toBeInTheDocument();
    });
  });

  it("should have proper styling applied to section", () => {
    const { container } = render(<TechStack />);
    const section = container.querySelector("section#stack");
    expect(section).toHaveClass("bg-paper-deep");
    expect(section).toHaveClass("text-ink");
  });

  it("should render all observability items", () => {
    render(<TechStack />);
    const observability = ["Grafana", "Prometheus", "Loki", "Langfuse", "Arize Phoenix", "ELK"];
    observability.forEach(item => {
      expect(screen.getByText(item)).toBeInTheDocument();
    });
  });

  it("should render all infrastructure items", () => {
    render(<TechStack />);
    const infra = ["Docker", "Kubernetes / Helm", "GitHub Actions", "Jenkins", "vLLM"];
    infra.forEach(item => {
      expect(screen.getByText(item)).toBeInTheDocument();
    });
  });

  it("should render all cloud platforms", () => {
    render(<TechStack />);
    const cloud = ["AWS", "GCP", "Azure", "Snowflake"];
    cloud.forEach(item => {
      expect(screen.getByText(item)).toBeInTheDocument();
    });
  });
});
