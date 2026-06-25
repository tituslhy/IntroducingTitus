import { render, screen } from "@testing-library/react";
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

    it("should render UOB role with deck and body text", () => {
      render(<Experience />);

      expect(screen.getByText(/Technical lead for a real-time GenAI contact-centre platform/i)).toBeInTheDocument();
      expect(screen.getByText(/Architected and delivered UOB's enterprise multi-agent platform/i)).toBeInTheDocument();
    });

    it("should render Illumina with pull quote (branch coverage line 159-167)", () => {
      render(<Experience />);

      expect(screen.getByText("Illumina")).toBeInTheDocument();
      const pullQuote = screen.getByText(/anticipated to save usd \$9 million upon full deployment/i);
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

      expect(screen.getByText("03a")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /education/i })).toBeInTheDocument();
    });

    it("should render both education institutions", () => {
      render(<Experience />);

      expect(screen.getByRole("heading", { name: /singapore management university/i })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: /national university of singapore/i })).toBeInTheDocument();
    });

    it("should render SMU degree and dates", () => {
      render(<Experience />);

      expect(screen.getByText("Master of IT in Business — AI Track")).toBeInTheDocument();
      expect(screen.getByText("2021 — 2022")).toBeInTheDocument();
    });

    it("should render NUS degree and dates", () => {
      render(<Experience />);

      expect(screen.getByText(/BEng Chemical Engineering, 2nd Upper Honours/i)).toBeInTheDocument();
      expect(screen.getByText("2011 — 2015")).toBeInTheDocument();
    });

    it("should render SMU honors list", () => {
      render(<Experience />);

      expect(screen.getByText(/GPA 3.98 \/ 4.0/)).toBeInTheDocument();
      expect(screen.getByText(/Dean's List/)).toBeInTheDocument();
      expect(screen.getByText(/SMU AI Talent Development Grant/)).toBeInTheDocument();
    });

    it("should render NUS honors", () => {
      render(<Experience />);

      expect(screen.getByText(/NUS Undergraduate Scholarship/)).toBeInTheDocument();
    });
  });

  describe("No family or personal details", () => {
    it("should never render family content", () => {
      render(<Experience />);

      expect(screen.queryByText(/wife|daughter|family|kids|children|spouse|personal/i)).not.toBeInTheDocument();
    });

    it("should not render salary or compensation", () => {
      render(<Experience />);

      expect(screen.queryByText(/salary|compensation|bonus|stock|equity/i)).not.toBeInTheDocument();
    });
  });

  describe("Styling and accessibility", () => {
    it("should render section with ink text color", () => {
      render(<Experience />);

      const section = document.querySelector("section#dossier");
      expect(section).toHaveClass("text-ink");
    });

    it("should render role articles with proper structure", () => {
      render(<Experience />);

      const articles = screen.getAllByRole("article");
      expect(articles.length).toBeGreaterThan(0);
      articles.forEach((article) => {
        expect(article).toHaveClass("relative", "grid");
      });
    });
  });

  describe("Branch coverage for conditional rendering", () => {
    it("should render pullQuotes for roles that have it (line 159-167)", () => {
      render(<Experience />);

      // Illumina and Toyota have pullQuotes
      expect(screen.getByText(/anticipated to save usd \$9 million upon full deployment/i)).toBeInTheDocument();
      expect(screen.getByText(/improved long-term forecast accuracy by ~25%/i)).toBeInTheDocument();
    });

    it("should render body text when present (line 153-156)", () => {
      render(<Experience />);

      expect(screen.getByText(/Architected and delivered UOB's enterprise multi-agent platform/i)).toBeInTheDocument();
      expect(screen.getByText(/Model shipped to the MyTransportSG app/i)).toBeInTheDocument();
    });

    it("should render tech tags when present (line 171-186)", () => {
      render(<Experience />);

      const techContent = document.querySelector("section#dossier");
      expect(techContent?.textContent).toMatch(/Python/);
      expect(techContent?.textContent).toMatch(/Java/);
      expect(techContent?.textContent).toMatch(/VBA/);
    });

    it("should apply correct class for non-incoming company (line 129)", () => {
      render(<Experience />);

      const mastercard = screen.getByRole("heading", { name: /mastercard/i });
      expect(mastercard).toHaveClass("text-ink");
    });
  });

  describe("Section structure", () => {
    it("should render main Experience section", () => {
      render(<Experience />);

      const section = document.querySelector("section#dossier");
      expect(section).toBeInTheDocument();
    });

    it("should render with borders between sections", () => {
      render(<Experience />);

      const borders = document.querySelectorAll("section#dossier .border-t, section#dossier .border-b");
      expect(borders.length).toBeGreaterThan(0);
    });
  });

  describe("Known uncovered branches (dead code in current dataset)", () => {
    it("documents line 129: role.incoming ? 'text-ink-soft' : 'text-ink'", () => {
      // Branch coverage: 66.66% overall
      // This conditional is defined for future roles where incoming: true
      // Currently NO roles in ROLES array have incoming: true set
      // When a role with incoming: true is added, this branch will be covered
      render(<Experience />);

      // Current behavior: all roles render with text-ink (the false branch)
      const allHeadings = screen.getAllByRole("heading", { level: 3 });
      expect(allHeadings.length).toBeGreaterThan(0);
      allHeadings.forEach((heading) => {
        expect(heading.className).toContain("text-ink");
      });
    });

    it("documents line 172: role.techNote ? true : false", () => {
      // Branch coverage: 66.66% overall
      // This conditional is defined for future roles where techNote is provided
      // Currently NO roles in ROLES array have techNote defined
      // When a role with techNote is added, this branch will be covered
      render(<Experience />);

      // Current behavior: all roles render tech tag lists (the false branch)
      const techLists = document.querySelectorAll("section#dossier ul[class*='flex']");
      expect(techLists.length).toBeGreaterThan(0);
    });
  });
});
