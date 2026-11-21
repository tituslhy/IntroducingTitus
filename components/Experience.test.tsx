import { fireEvent, render, screen, within } from "@testing-library/react";
import { AGENT_SUITE_URL } from "@/lib/content";
import { FEATURED_ROLE_COUNT, ROLES, pageFolio } from "@/lib/profile";
import Experience from "./Experience";

describe("Experience", () => {
  it("should render a back-to-top link in the section marker row", () => {
    const { container } = render(<Experience />);
    const marker = container.querySelector("section#dossier header > div");
    const link = screen.getByRole("link", { name: /back to top/i });
    expect(marker).toContainElement(link);
    expect(link).toHaveAttribute("href", "#top");
  });

  it("should render experience section with correct heading", () => {
    render(<Experience />);

    // Check for heading text fragments since they're split by <em>
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("Where I have");
    expect(heading).toHaveTextContent("worked");
    expect(heading).toHaveTextContent("in reverse");
    expect(heading.querySelector("em")).toHaveClass("italic", "text-amber");
  });

  it("should render section folio from pageFolio and kicker", () => {
    const { container } = render(<Experience />);
    const marker = container.querySelector("section#dossier header > div");

    expect(within(marker as HTMLElement).getByText(pageFolio("/experience"))).toBeInTheDocument();
    expect(within(marker as HTMLElement).getByText("Experience")).toBeInTheDocument();
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

      expect(
        screen.getByText(/Tech lead and anchor contributor for the core SDK behind Agent Suite/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Architected and built the SDK and CLI, including a bespoke package-manager setup/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Agents are built declaratively/i)).toBeInTheDocument();
      expect(screen.getByText(/teams declare them in YAML/i)).toBeInTheDocument();
    });

    it("should render Mastercard tech tags", () => {
      render(<Experience />);

      const section = screen.getByRole("heading", { name: /mastercard/i }).closest("article");
      expect(section).not.toBeNull();
      for (const tag of ["Python", "LangChain", "Typer", "FastAPI", "Docker", "Helm Charts", "GitHub Actions", "Apache Jenkins"]) {
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

      expect(
        screen.getByText(/Sole engineer on a real-time GenAI contact-centre platform: live call transcripts, in-call assistance and policy search for agents, and post-call summaries with red-flag and promise checks/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Picked up Java to take over its Spring Boot microservices, and cut false positives in its post-call checks by 80%/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Also built the MCP service behind UOB's customer onboarding workflow: a deterministic LangGraph workflow that handles incomplete and inconsistent documents/i)
      ).toBeInTheDocument();
    });

    it("should not carry the removed 'Technical lead', 'Sole owner' or 'multi-agent GenAI platform' wording on the UOB card", () => {
      render(<Experience />);

      const section = screen.getByRole("heading", { name: /united overseas bank/i }).closest("article");
      expect(section).not.toBeNull();
      expect(section?.textContent).not.toMatch(/Technical lead/i);
      expect(section?.textContent).not.toMatch(/Sole owner/i);
      expect(section?.textContent).not.toMatch(/multi-agent GenAI platform/i);
      expect(section?.textContent).not.toMatch(/maintaining/i);
      expect(section?.textContent).not.toMatch(/BYOA/);
      expect(section?.textContent).not.toMatch(/BYOC/);
      expect(section?.textContent).not.toMatch(/including the MCP tool/i);
    });

    it("should render the job title in a serif element separate from the location", () => {
      render(<Experience />);

      const section = screen.getByRole("heading", { name: /united overseas bank/i }).closest("article");
      expect(section).not.toBeNull();
      const title = within(section as HTMLElement).getByText("Vice President, Generative AI");
      const location = within(section as HTMLElement).getByText("Singapore");

      expect(title.tagName).toBe("SPAN");
      expect(title).toHaveClass("font-serif", "text-ink");
      expect(title.textContent).toBe("Vice President, Generative AI");

      expect(location.tagName).toBe("SPAN");
      expect(location).toHaveClass("font-mono");
      expect(location).not.toBe(title);
      expect(title).not.toContainElement(location);
      expect(location).not.toContainElement(title);
      expect(title.parentElement).toBe(location.parentElement);
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

  describe("Tech highlighting", () => {
    it("marks the same tech in other roles when a Mastercard Docker tag is hovered", () => {
      render(<Experience />);

      const mastercard = screen.getByRole("heading", { name: /mastercard/i }).closest("article") as HTMLElement;
      const uob = screen.getByRole("heading", { name: /united overseas bank/i }).closest("article") as HTMLElement;
      const illumina = screen.getByRole("heading", { name: /illumina/i }).closest("article") as HTMLElement;

      fireEvent.mouseOver(within(mastercard).getByText("Docker"));

      expect(within(mastercard).getByText("Docker")).toHaveAttribute("data-on");
      expect(within(uob).getByText("Docker")).toHaveAttribute("data-on");
      // Illumina lists "Docker+CUDA", a different tool key, so it stays unmarked.
      expect(within(illumina).getByText("Docker+CUDA")).not.toHaveAttribute("data-on");
    });

    it("does not mark a different tech such as Python when Docker is hovered", () => {
      render(<Experience />);

      const mastercard = screen.getByRole("heading", { name: /mastercard/i }).closest("article") as HTMLElement;
      const uob = screen.getByRole("heading", { name: /united overseas bank/i }).closest("article") as HTMLElement;
      const illumina = screen.getByRole("heading", { name: /illumina/i }).closest("article") as HTMLElement;

      fireEvent.mouseOver(within(mastercard).getByText("Docker"));

      expect(within(mastercard).getByText("Python")).not.toHaveAttribute("data-on");
      expect(within(illumina).getByText("Python")).not.toHaveAttribute("data-on");
      expect(within(uob).queryByText("Python")).toBeNull();
    });

    it("clears the Docker highlight when the pointer leaves the roles", () => {
      const { container } = render(<Experience />);

      const mastercard = screen.getByRole("heading", { name: /mastercard/i }).closest("article") as HTMLElement;
      const uob = screen.getByRole("heading", { name: /united overseas bank/i }).closest("article") as HTMLElement;
      const wrapper = mastercard.parentElement as HTMLElement;
      expect(wrapper).toContainElement(uob);

      fireEvent.mouseOver(within(mastercard).getByText("Docker"));
      expect(within(uob).getByText("Docker")).toHaveAttribute("data-on");

      fireEvent.mouseLeave(wrapper);
      expect(within(uob).getByText("Docker")).not.toHaveAttribute("data-on");
      expect(within(mastercard).getByText("Docker")).not.toHaveAttribute("data-on");
      expect(container.querySelectorAll("[data-on]")).toHaveLength(0);
    });

    it("gives each tech tag the highlight classes and a normalised data-tech key", () => {
      render(<Experience />);

      const uob = screen.getByRole("heading", { name: /united overseas bank/i }).closest("article") as HTMLElement;
      const tag = within(uob).getByText("Java (Spring Boot)");
      expect(tag).toHaveAttribute("data-tech", "java (spring boot)");
      expect(tag).toHaveClass("data-[on]:text-ink", "data-[on]:underline");
    });
  });

  describe("Education moved to its own page", () => {
    it("no longer renders an education section or any degree on the experience page", () => {
      const { container } = render(<Experience />);

      expect(container.querySelector("#education")).toBeNull();
      expect(container.querySelector("[id^='edu-']")).toBeNull();
      expect(screen.queryByRole("heading", { name: /education/i })).not.toBeInTheDocument();
      expect(screen.queryByText("Singapore Management University")).not.toBeInTheDocument();
      expect(screen.queryByText("GPA 3.98 / 4.0")).not.toBeInTheDocument();
    });

    it("ends with a link to /education, labelled as the next page", () => {
      render(<Experience />);

      const next = screen.getByRole("link", { name: /next: education/i });
      expect(next).toHaveAttribute("href", "/education");
      expect(next).toHaveTextContent("→");
    });

    it("places the link after the last role, as the final content of the section", () => {
      const { container } = render(<Experience />);
      const section = container.querySelector("section#dossier") as HTMLElement;
      const next = screen.getByRole("link", { name: /next: education/i });
      const lastRole = container.querySelectorAll("article[id^='role-']");

      expect(section).toContainElement(next);
      expect(next.compareDocumentPosition(lastRole[lastRole.length - 1]) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
      expect(section.lastElementChild?.querySelector("a[href='/education']")).toBe(next);
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

  describe("Earlier roles", () => {
    const roleArticles = (container: HTMLElement) =>
      Array.from(container.querySelectorAll<HTMLElement>("article[id^='role-']"));
    const yearOf = (article: HTMLElement) => article.querySelector<HTMLElement>("div.sticky > span");

    it("renders exactly one Earlier roles heading, as an h3", () => {
      render(<Experience />);

      const headings = screen.getAllByRole("heading", { name: "Earlier roles" });
      expect(headings).toHaveLength(1);
      expect(headings[0].tagName).toBe("H3");
    });

    it("sits after the 3rd role article and before the 4th, in DOM order", () => {
      const { container } = render(<Experience />);
      const articles = roleArticles(container);
      const heading = screen.getByRole("heading", { name: "Earlier roles" });

      expect(articles).toHaveLength(ROLES.length);
      expect(FEATURED_ROLE_COUNT).toBe(3);

      const featuredLast = articles[FEATURED_ROLE_COUNT - 1];
      const firstEarlier = articles[FEATURED_ROLE_COUNT];
      expect(featuredLast).toHaveAttribute("id", `role-${ROLES[FEATURED_ROLE_COUNT - 1].slug}`);
      expect(firstEarlier).toHaveAttribute("id", `role-${ROLES[FEATURED_ROLE_COUNT].slug}`);

      // Exactly the featured roles come before the heading; the rest come after it.
      const before = articles.filter((a) => a.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING);
      const after = articles.filter((a) => a.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_PRECEDING);
      expect(before).toHaveLength(FEATURED_ROLE_COUNT);
      expect(after).toHaveLength(ROLES.length - FEATURED_ROLE_COUNT);

      expect(heading.previousElementSibling).toBe(featuredLast);
      expect(heading.nextElementSibling).toBe(firstEarlier);
    });

    it("draws the first FEATURED_ROLE_COUNT years at text-[44px] and the earlier ones at text-[32px]", () => {
      const { container } = render(<Experience />);
      const articles = roleArticles(container);

      expect(articles).toHaveLength(ROLES.length);
      articles.forEach((article, i) => {
        const year = yearOf(article);
        const large = i < FEATURED_ROLE_COUNT;
        expect(year?.textContent).toBe(ROLES[i].years);
        expect(year).toHaveClass(large ? "text-[44px]" : "text-[32px]");
        expect(year).not.toHaveClass(large ? "text-[32px]" : "text-[44px]");
      });
    });
  });
});
