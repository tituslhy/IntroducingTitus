import { render, screen, within } from "@testing-library/react";
import { AGENT_SUITE_URL } from "@/lib/content";
import Experience from "./Experience";

describe("Experience", () => {
  it("should render experience section with correct heading", () => {
    render(<Experience />);

    // Check for heading text fragments since they're split by <em>
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("Where I have");
    expect(heading).toHaveTextContent("worked");
    expect(heading).toHaveTextContent("in reverse");
    expect(heading.querySelector("em")).toHaveClass("italic", "text-amber");
  });

  it("should render section folio number 03 and kicker", () => {
    render(<Experience />);

    expect(screen.getByText("03")).toBeInTheDocument();
    expect(screen.getByText("Experience")).toBeInTheDocument();
  });

  describe("Role Entries", () => {
    it("should render all role companies", () => {
      render(<Experience />);

      expect(screen.getByRole("heading", { name: /mastercard/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /united overseas bank/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /illumina/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /ck delta/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /energy market authority/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /jobtech/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /toyota tsusho/i })).toBeInTheDocument();
    });

    it("should render Mastercard role", () => {
      render(<Experience />);

      const mastercard = screen.getByRole("heading", { name: /mastercard/i });
      expect(mastercard).toBeInTheDocument();

      // Mastercard doesn't have incoming: true, so no badge
      const incomingBadges = screen.queryAllByText("Incoming");
      expect(incomingBadges).toHaveLength(0);
    });

    it("should render Mastercard Agent Suite link and R&D Foundry deck", () => {
      render(<Experience />);

      const agentSuiteLink = screen.getByRole("link", { name: /agent suite/i });
      expect(agentSuiteLink).toHaveAttribute("href", AGENT_SUITE_URL);
      expect(agentSuiteLink).toHaveAttribute("target", "_blank");
      expect(agentSuiteLink.getAttribute("rel")).toContain("noopener");

      expect(screen.getByText(/at the R&D Foundry/i)).toBeInTheDocument();
      expect(
        screen.getByText(/build, test, and deploy AI agents/i)
      ).toBeInTheDocument();
    });

    it("should render Mastercard body describing the core SDK and CLI", () => {
      render(<Experience />);

      expect(screen.getByText(/built the core SDK and CLI for Agent Suite/i)).toBeInTheDocument();
      expect(screen.getByText(/declare agents in YAML/i)).toBeInTheDocument();
    });

    it("should render Mastercard tech tags", () => {
      render(<Experience />);

      const section = screen.getByRole("heading", { name: /mastercard/i }).closest("article");
      expect(section).not.toBeNull();
      for (const tag of ["Python", "LangChain", "Typer", "ASGI", "YAML"]) {
        expect(within(section as HTMLElement).getByText(tag)).toBeInTheDocument();
      }
    });

    it("should not leak internal compliance specifics on the Mastercard card", () => {
      render(<Experience />);

      const section = screen.getByRole("heading", { name: /mastercard/i }).closest("article");
      expect(section?.textContent).not.toMatch(/audit hold|retention|purge|guardrail/i);
    });

    it("should render UOB role with deck and body text", () => {
      render(<Experience />);

      expect(screen.getByText(/Technical lead for a real-time GenAI contact-centre platform/i)).toBeInTheDocument();
      expect(screen.getByText(/Developed UOB's enterprise multi-agent GenAI platform/i)).toBeInTheDocument();
    });

    it("should render Illumina with pull quote (branch coverage line 159-167)", () => {
      render(<Experience />);

      expect(screen.getByText("Illumina")).toBeInTheDocument();
      const pullQuote = screen.getByText(/anticipated to save usd 9 million upon full deployment/i);
      expect(pullQuote).toBeInTheDocument();
      expect(pullQuote).toHaveClass("font-serif", "italic");
    });

    it("should render Toyota with pull quote", () => {
      render(<Experience />);

      const toyotaQuote = screen.getByText(/improved long-term forecast accuracy by ~25%/i);
      expect(toyotaQuote).toBeInTheDocument();
    });

    it("should render role deck text (main summary)", () => {
      render(<Experience />);

      expect(screen.getByText(/Solo-architected and shipped two production AI systems/i)).toBeInTheDocument();
    });

    it("should render role body text when present (branch coverage line 153-156)", () => {
      render(<Experience />);

      // CK Delta has body text
      expect(screen.getByText(/Model shipped to the MyTransportSG app/i)).toBeInTheDocument();

      // Illumina has body text
      expect(screen.getByText(/An agentic document-retrieval platform/i)).toBeInTheDocument();
    });

    it("should render tech tags for roles (branch coverage line 176-185)", () => {
      render(<Experience />);

      // UOB role has tech tags
      expect(screen.getByText("Java (Spring Boot)")).toBeInTheDocument();
      expect(screen.getByText("Redis")).toBeInTheDocument();
      expect(screen.getByText("Oracle DB")).toBeInTheDocument();
      expect(screen.getByText("vLLM")).toBeInTheDocument();

      // Illumina role has tech tags
      expect(screen.getAllByText("Python").length).toBeGreaterThan(0);
      expect(screen.getByText("LlamaIndex")).toBeInTheDocument();
      expect(screen.getByText("Qdrant")).toBeInTheDocument();
    });

    it("should render Toyota tech tags", () => {
      render(<Experience />);

      expect(screen.getByText("VBA")).toBeInTheDocument();
      expect(screen.getByText("Excel")).toBeInTheDocument();
      expect(screen.getByText("Exponential Smoothing")).toBeInTheDocument();
      expect(screen.getByText("Holt-Winters")).toBeInTheDocument();
    });

    it("should render dates for each role", () => {
      render(<Experience />);

      expect(screen.getByText("Jul 2026 — Present")).toBeInTheDocument();
      expect(screen.getByText("Jun 2025 — Jul 2026")).toBeInTheDocument();
      expect(screen.getByText("Jan 2023 — Jun 2025")).toBeInTheDocument();
    });

    it("should render location for each role", () => {
      render(<Experience />);

      const locations = screen.getAllByText("Singapore");
      expect(locations.length).toBeGreaterThan(0);
    });

    it("should render year markers", () => {
      render(<Experience />);

      expect(screen.getByText("2026")).toBeInTheDocument();
      expect(screen.getByText("2025")).toBeInTheDocument();
      expect(screen.getByText("2023")).toBeInTheDocument();
      expect(screen.getByText("2022")).toBeInTheDocument();
    });

    it("should render role positions and titles", () => {
      render(<Experience />);

      expect(screen.getByText("Lead AI Engineer")).toBeInTheDocument();
      expect(screen.getByText("Vice President, Generative AI")).toBeInTheDocument();
      expect(screen.getByText("Senior Data Scientist")).toBeInTheDocument();
    });
  });

  describe("Education Section", () => {
    it("should render education section header", () => {
      render(<Experience />);

      expect(screen.getByText("04")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /education/i })).toBeInTheDocument();
    });

    it("should render all education entries", () => {
      render(<Experience />);

      expect(screen.getByText("Singapore Management University")).toBeInTheDocument();
      expect(screen.getByText("National University of Singapore")).toBeInTheDocument();
    });

    it("should render correct degrees", () => {
      render(<Experience />);

      expect(screen.getByText(/Master of IT in Business/i)).toBeInTheDocument();
      expect(screen.getByText(/BEng Chemical Engineering/i)).toBeInTheDocument();
    });

    it("should render education dates", () => {
      render(<Experience />);

      expect(screen.getByText("2021 — 2022")).toBeInTheDocument();
      expect(screen.getByText("2011 — 2015")).toBeInTheDocument();
    });

    it("should render honors (branch coverage line 206-209)", () => {
      render(<Experience />);

      expect(screen.getByText("GPA 3.98 / 4.0")).toBeInTheDocument();
      expect(screen.getByText(/Dean's List/)).toBeInTheDocument();
      expect(screen.getByText("SMU AI Talent Development Grant")).toBeInTheDocument();
      expect(screen.getByText("NUS Undergraduate Scholarship")).toBeInTheDocument();
    });
  });

  describe("Styling and Layout", () => {
    it("should render experience section with correct structure", () => {
      const { container } = render(<Experience />);
      const section = container.querySelector("section#dossier");
      expect(section).toBeInTheDocument();
      expect(section).toHaveClass("text-ink");
    });

    it("should have proper heading structure for roles (h3 for company names)", () => {
      render(<Experience />);

      const mastercardHeading = screen.getByRole("heading", { name: /mastercard/i });
      expect(mastercardHeading.tagName).toBe("H3");
    });
  });
});
