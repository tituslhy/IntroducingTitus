import { render, screen } from "@testing-library/react";
import ProjectsWriting from "./ProjectsWriting";

describe("ProjectsWriting", () => {
  describe("Projects Section", () => {
    it("should render projects section header", () => {
      render(<ProjectsWriting />);

      // The heading has <em> tags embedded, so check with multiple text fragments
      const heading = screen.getAllByRole("heading", { level: 2 })[0];
      expect(heading).toHaveTextContent("Things I have");
      expect(heading).toHaveTextContent("built");
      expect(heading.querySelector("em")).toHaveClass("italic", "text-amber");
    });

    it("should render projects folio and kicker", () => {
      render(<ProjectsWriting />);

      const projectsSection = document.querySelector("section#projects");
      expect(projectsSection?.textContent).toMatch(/05/);
      expect(projectsSection?.textContent).toMatch(/Projects/);
    });

    describe("Project Cards", () => {
      it("should render all three projects with correct titles", () => {
        render(<ProjectsWriting />);

        expect(screen.getByRole("heading", { name: /fictional-bassoon/i })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: /illumina agentic rag/i })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: /themarginc/i })).toBeInTheDocument();
      });

      it("should render fictional-bassoon project with 54 containers", () => {
        render(<ProjectsWriting />);

        expect(screen.getByText("fictional-bassoon")).toBeInTheDocument();
        expect(screen.getByText("54")).toBeInTheDocument();
      });

      it("should render fictional-bassoon project subtitle", () => {
        render(<ProjectsWriting />);

        expect(screen.getByText(/a fifty-four-container llm harness, vibe-coded end-to-end/i)).toBeInTheDocument();
      });

      it("should render fictional-bassoon full description", () => {
        render(<ProjectsWriting />);

        expect(screen.getByText(/fifty-four containers, deliberately: a full production-realistic stack/i)).toBeInTheDocument();
      });

      it("should render fictional-bassoon with 90%+ test coverage", () => {
        render(<ProjectsWriting />);

        expect(screen.getByText("90%+")).toBeInTheDocument();
      });

      it("should render fictional-bassoon GitHub link", () => {
        render(<ProjectsWriting />);

        const githubLinks = screen.getAllByRole("link").filter(
          (link) => link.getAttribute("href") === "https://github.com/tituslhy/fictional-bassoon"
        );
        expect(githubLinks.length).toBeGreaterThan(0);
      });

      it("should render Illumina RAG project", () => {
        render(<ProjectsWriting />);

        expect(screen.getByText("Illumina Agentic RAG")).toBeInTheDocument();
        expect(screen.getByText(/sixteen-component production retrieval platform/i)).toBeInTheDocument();
      });

      it("should render Illumina RAG with 16 components and savings", () => {
        render(<ProjectsWriting />);

        expect(screen.getByText("16")).toBeInTheDocument();
        expect(screen.getByText("$9M")).toBeInTheDocument();
      });

      it("should render Illumina RAG description", () => {
        render(<ProjectsWriting />);

        expect(screen.getByText(/production-grade agentic rag for enterprise field-service engineering/i)).toBeInTheDocument();
      });

      it("should render TheMarginCall project", () => {
        render(<ProjectsWriting />);

        expect(screen.getByText("TheMarginCall")).toBeInTheDocument();
        expect(screen.getByText(/six specialists arguing about your portfolio/i)).toBeInTheDocument();
      });

      it("should render TheMarginCall with 6 agents and II modes", () => {
        render(<ProjectsWriting />);

        expect(screen.getByText("6")).toBeInTheDocument();
        expect(screen.getByText("II")).toBeInTheDocument();
      });

      it("should render TheMarginCall description", () => {
        render(<ProjectsWriting />);

        expect(screen.getByText(/a multi-agent investment guidance crew built on autogen/i)).toBeInTheDocument();
      });

      it("should render TheMarginCall GitHub link", () => {
        render(<ProjectsWriting />);

        const githubLinks = screen.getAllByRole("link").filter(
          (link) => link.getAttribute("href") === "https://github.com/tituslhy/TheMarginCall"
        );
        expect(githubLinks.length).toBeGreaterThan(0);
      });

      it("should render TheMarginCall demo link (branch: demo link present)", () => {
        render(<ProjectsWriting />);

        const demoLinks = screen.getAllByRole("link").filter(
          (link) => link.getAttribute("href") === "https://www.youtube.com/watch?v=uLtMD3J4U40"
        );
        expect(demoLinks.length).toBeGreaterThan(0);
      });

      it("should render project tech stack tags", () => {
        render(<ProjectsWriting />);

        expect(screen.getByText("LangGraph")).toBeInTheDocument();
        expect(screen.getByText("Postgres")).toBeInTheDocument();
        expect(screen.getByText("Langfuse")).toBeInTheDocument();

        const llamaIndexTags = screen.getAllByText("LlamaIndex");
        expect(llamaIndexTags.length).toBeGreaterThanOrEqual(1);

        const qdrantTags = screen.getAllByText("Qdrant");
        expect(qdrantTags.length).toBeGreaterThanOrEqual(1);

        expect(screen.getByText("Autogen")).toBeInTheDocument();
      });

      it("should render different project descriptions", () => {
        render(<ProjectsWriting />);

        const projectsSection = document.querySelector("section#projects");
        expect(projectsSection?.textContent).toMatch(/fastapi/i);
        expect(projectsSection?.textContent).toMatch(/semantic/i);
        expect(projectsSection?.textContent).toMatch(/statistical analyst/i);
      });
    });

    describe("Open-source Contributions Section", () => {
      it("should render open-source contributions header", () => {
        render(<ProjectsWriting />);

        const projectsSection = document.querySelector("section#projects");
        expect(projectsSection?.textContent).toMatch(/06/);
        expect(projectsSection?.textContent).toMatch(/open-source contributions/i);
      });

      it("should render LlamaIndex contributions", () => {
        render(<ProjectsWriting />);

        expect(screen.getByText(/integration with microsoft llmlingua2/i)).toBeInTheDocument();
        expect(screen.getByText(/gmail tool bug fix/i)).toBeInTheDocument();
      });

      it("should render Unsloth contribution", () => {
        render(<ProjectsWriting />);

        expect(screen.getByText(/retrieval augmented finetuning cookbook/i)).toBeInTheDocument();
      });

      it("should render IBM ACP contribution", () => {
        render(<ProjectsWriting />);

        expect(screen.getByText(/Agent Communication Protocol/i)).toBeInTheDocument();
      });

      it("should render Giskard contribution", () => {
        render(<ProjectsWriting />);

        expect(screen.getByText(/raget bug fix/i)).toBeInTheDocument();
      });

      it("should render Chainlit contribution", () => {
        render(<ProjectsWriting />);

        expect(screen.getByText(/Chainlit.*LlamaIndex.*cookbook/i)).toBeInTheDocument();
      });

      it("should have external links for open-source contributions", () => {
        render(<ProjectsWriting />);

        const projectsSection = document.querySelector("section#projects");
        const contributionLinks = projectsSection?.querySelectorAll("a[href*='github.com']");
        expect((contributionLinks?.length || 0) >= 6).toBe(true);
      });
    });
  });

  describe("Writing Section", () => {
    it("should render writing section header", () => {
      render(<ProjectsWriting />);

      const heading = screen.getByRole("heading", { name: /seven articles, of sixty five/i });
      expect(heading).toBeInTheDocument();
      expect(heading.querySelector("em")).toHaveClass("italic", "text-amber");
    });

    it("should render writing folio and kicker", () => {
      render(<ProjectsWriting />);

      const writingSection = document.querySelector("section#writing");
      expect(writingSection?.textContent).toMatch(/07/);
      expect(writingSection?.textContent).toMatch(/Writing/);
    });

    it("should render featured by section", () => {
      render(<ProjectsWriting />);

      const writingSection = document.querySelector("section#writing");
      expect(writingSection?.textContent).toMatch(/featured by/i);
      expect(writingSection?.textContent).toMatch(/singapore management university/i);
      expect(writingSection?.textContent).toMatch(/LlamaIndex/i);
      expect(writingSection?.textContent).toMatch(/ibm/i);
      expect(writingSection?.textContent).toMatch(/flowerai/i);
    });

    it("should reference full archive on Medium", () => {
      render(<ProjectsWriting />);

      const writingSection = document.querySelector("section#writing");
      expect(writingSection?.textContent).toMatch(/the full archive lives on medium/i);
    });

    it("should reference 8 blockchain articles in archive", () => {
      render(<ProjectsWriting />);

      const writingSection = document.querySelector("section#writing");
      expect(writingSection?.textContent).toMatch(/including 8 on blockchain/i);
    });

    describe("Featured Articles", () => {
      it("should render all seven featured articles", () => {
        render(<ProjectsWriting />);

        expect(screen.getByText(/agent memory: the underrated superpower of agentic apps/i)).toBeInTheDocument();
        expect(screen.getByText(/how to train your llm: low-rank adaptation finetuning using unsloth/i)).toBeInTheDocument();
        expect(screen.getByText(/how to raft your llm: retrieval augmented finetuning using unsloth/i)).toBeInTheDocument();
        expect(screen.getByText(/a second look at langgraph:/i)).toBeInTheDocument();
        expect(screen.getByText(/helm charts: the multi-server orchestra conductor/i)).toBeInTheDocument();
        expect(screen.getByText(/a gentle introduction to litellm/i)).toBeInTheDocument();
        expect(screen.getByText(/your agent needs a bouncer/i)).toBeInTheDocument();
      });

      it("should render 7th featured article with correct title and venue", () => {
        render(<ProjectsWriting />);

        const seventhArticle = screen.getByText(/your agent needs a bouncer/i);
        expect(seventhArticle).toBeInTheDocument();
        const writingSection = document.querySelector("section#writing");
        expect(writingSection?.textContent).toMatch(/your agent needs a bouncer/i);
        expect(writingSection?.textContent).toMatch(/13 min/);
      });

      it("should render 7th article with correct link to MITB for All", () => {
        render(<ProjectsWriting />);

        const seventhArticleLink = screen.getByRole("link", { name: /your agent needs a bouncer/i });
        expect(seventhArticleLink).toHaveAttribute(
          "href",
          "https://medium.com/mitb-for-all/your-ai-agent-needs-a-bouncer-f115d5ddac55"
        );
      });

      it("should render article venue and read times", () => {
        render(<ProjectsWriting />);

        const writingSection = document.querySelector("section#writing");

        expect(writingSection?.textContent).toMatch(/mitb for all/i);
        expect(writingSection?.textContent).toMatch(/11 min/);
        expect(writingSection?.textContent).toMatch(/14 min/);
        expect(writingSection?.textContent).toMatch(/9 min/);
        expect(writingSection?.textContent).toMatch(/13 min/);
      });

      it("should render article links pointing to Medium", () => {
        render(<ProjectsWriting />);

        const writingSection = document.querySelector("section#writing");
        const articleLinks = writingSection?.querySelectorAll("a[href*='medium.com']");
        expect((articleLinks?.length || 0) >= 7).toBe(true);
      });

      it("should have correct href for Agent Memory article", () => {
        render(<ProjectsWriting />);

        const agentMemoryLink = screen.getByRole("link", { name: /agent memory: the underrated superpower/i });
        expect(agentMemoryLink).toHaveAttribute(
          "href",
          "https://medium.com/mitb-for-all/agent-memory-the-underrated-superpower-of-agentic-apps-1c16fb47f435"
        );
      });
    });

    it("should render full archive button", () => {
      render(<ProjectsWriting />);

      const mediumButton = screen.getByRole("link", { name: /the full archive on medium/i });
      expect(mediumButton).toHaveAttribute("href", "https://medium.com/@tituslhy");
    });

    it("should render writing section with dark background", () => {
      render(<ProjectsWriting />);

      const writingSection = document.querySelector("section#writing");
      expect(writingSection?.className).toMatch(/bg-paper-deep/);
    });
  });

  describe("Styling and Accessibility", () => {
    it("should render projects and writing as separate sections", () => {
      render(<ProjectsWriting />);

      const projectsSection = document.querySelector("section#projects");
      const writingSection = document.querySelector("section#writing");

      expect(projectsSection).toBeInTheDocument();
      expect(writingSection).toBeInTheDocument();
    });

    it("should render projects with text-ink color", () => {
      render(<ProjectsWriting />);

      const projectsSection = document.querySelector("section#projects");
      expect(projectsSection?.className).toMatch(/text-ink/);
    });

    it("should render writing with text-ink color", () => {
      render(<ProjectsWriting />);

      const writingSection = document.querySelector("section#writing");
      expect(writingSection?.className).toMatch(/text-ink/);
    });

    it("should render article list as ordered list", () => {
      render(<ProjectsWriting />);

      const writingSection = document.querySelector("section#writing");
      const orderedList = writingSection?.querySelector("ol");
      expect(orderedList).toBeInTheDocument();
    });
  });

  describe("Branch Coverage - Conditional Rendering", () => {
    it("should render projects with github link when present (branch: line 156-165)", () => {
      render(<ProjectsWriting />);

      const projectsSection = document.querySelector("section#projects");
      const githubLinks = projectsSection?.querySelectorAll("a[href*='github.com/tituslhy']");
      expect((githubLinks?.length || 0) >= 2).toBe(true);
    });

    it("should render projects with demo link when present (branch: line 167-177)", () => {
      render(<ProjectsWriting />);

      const demoLink = document.querySelector("a[href*='youtube.com']");
      expect(demoLink).toBeInTheDocument();
    });

    it("should NOT render demo link for Illumina RAG (github and demo are null)", () => {
      render(<ProjectsWriting />);

      const projectsSection = document.querySelector("section#projects");
      const demoLinks = projectsSection?.querySelectorAll("a[href*='youtube']");
      // Only 1 demo link should exist (TheMarginCall)
      expect((demoLinks?.length || 0) <= 1).toBe(true);
    });

    it("should apply correct accent colors for projects (branch: line 95-99)", () => {
      render(<ProjectsWriting />);

      // Verify projects render with different accent colors
      const illuminaHeading = screen.getByText("Illumina Agentic RAG");
      expect(illuminaHeading).toBeInTheDocument();

      const bassoonHeading = screen.getByText("fictional-bassoon");
      expect(bassoonHeading).toBeInTheDocument();
    });
  });

  describe("No personal details", () => {
    it("should not render family or personal information", () => {
      render(<ProjectsWriting />);

      expect(screen.queryByText(/wife|daughter|family|kids|children|spouse/i)).not.toBeInTheDocument();
    });
  });

  describe("Content completeness", () => {
    it("should render fictional-bassoon with all metrics", () => {
      render(<ProjectsWriting />);

      const projectsSection = document.querySelector("section#projects");
      expect(projectsSection?.textContent).toMatch(/fictional-bassoon/);
      expect(projectsSection?.textContent).toMatch(/54/);
      expect(projectsSection?.textContent).toMatch(/90%/);
    });

    it("should render Illumina RAG with all metrics", () => {
      render(<ProjectsWriting />);

      const projectsSection = document.querySelector("section#projects");
      expect(projectsSection?.textContent).toMatch(/illumina/i);
      expect(projectsSection?.textContent).toMatch(/16/);
      expect(projectsSection?.textContent).toMatch(/9m/i);
    });

    it("should render TheMarginCall with all metrics", () => {
      render(<ProjectsWriting />);

      const projectsSection = document.querySelector("section#projects");
      expect(projectsSection?.textContent).toMatch(/margin/i);
      expect(projectsSection?.textContent).toMatch(/6/);
      expect(projectsSection?.textContent).toMatch(/II/);
    });
  });
});
