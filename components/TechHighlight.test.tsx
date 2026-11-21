import { fireEvent, render } from "@testing-library/react";
import TechHighlight from "./TechHighlight";

function Fixture() {
  return (
    <TechHighlight>
      <div data-testid="role-a">
        <ul>
          <li data-tech="docker">Docker</li>
          <li data-tech="python">Python</li>
          <li data-tech="docker">
            <span data-testid="docker-inner">Docker</span>
          </li>
        </ul>
        <p data-testid="prose">Plain prose with no tags.</p>
      </div>
      <div data-testid="role-b">
        <ul>
          <li data-tech="docker">Docker</li>
          <li data-tech="redis">Redis</li>
        </ul>
      </div>
    </TechHighlight>
  );
}

function tagsFor(container: HTMLElement, key: string) {
  return Array.from(container.querySelectorAll<HTMLElement>(`[data-tech="${key}"]`));
}

function onTags(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-on]"));
}

describe("TechHighlight", () => {
  it("renders its children unchanged", () => {
    const { getByText, container } = render(<Fixture />);
    expect(getByText("Plain prose with no tags.")).toBeInTheDocument();
    expect(onTags(container)).toHaveLength(0);
  });

  it("marks every tag with the hovered key and no others", () => {
    const { container } = render(<Fixture />);
    const [firstDocker] = tagsFor(container, "docker");

    fireEvent.mouseOver(firstDocker);

    for (const el of tagsFor(container, "docker")) {
      expect(el).toHaveAttribute("data-on");
    }
    expect(tagsFor(container, "python")[0]).not.toHaveAttribute("data-on");
    expect(tagsFor(container, "redis")[0]).not.toHaveAttribute("data-on");
  });

  it("marks the tag when hovering a child element inside it", () => {
    const { container, getByTestId } = render(<Fixture />);

    fireEvent.mouseOver(getByTestId("docker-inner"));

    expect(tagsFor(container, "docker")).toHaveLength(3);
    for (const el of tagsFor(container, "docker")) {
      expect(el).toHaveAttribute("data-on");
    }
    expect(tagsFor(container, "python")[0]).not.toHaveAttribute("data-on");
  });

  it("switches the highlight when moving to a tag with a different key", () => {
    const { container } = render(<Fixture />);

    fireEvent.mouseOver(tagsFor(container, "docker")[0]);
    fireEvent.mouseOver(tagsFor(container, "python")[0]);

    expect(tagsFor(container, "python")[0]).toHaveAttribute("data-on");
    for (const el of tagsFor(container, "docker")) {
      expect(el).not.toHaveAttribute("data-on");
    }
    expect(onTags(container)).toHaveLength(1);
  });

  it("keeps exactly one key highlighted across several hovers", () => {
    const { container } = render(<Fixture />);

    fireEvent.mouseOver(tagsFor(container, "redis")[0]);
    fireEvent.mouseOver(tagsFor(container, "docker")[1]);
    fireEvent.mouseOver(tagsFor(container, "docker")[0]);

    expect(onTags(container)).toHaveLength(3);
    for (const el of onTags(container)) {
      expect(el.dataset.tech).toBe("docker");
    }
  });

  it("clears the highlight when hovering non-tag content", () => {
    const { container, getByTestId } = render(<Fixture />);

    fireEvent.mouseOver(tagsFor(container, "docker")[0]);
    expect(onTags(container)).toHaveLength(3);

    fireEvent.mouseOver(getByTestId("prose"));

    expect(onTags(container)).toHaveLength(0);
  });

  it("clears the highlight when the wrapper is left", () => {
    const { container } = render(<Fixture />);
    const wrapper = container.firstElementChild as HTMLElement;

    fireEvent.mouseOver(tagsFor(container, "docker")[0]);
    expect(onTags(container)).toHaveLength(3);

    fireEvent.mouseLeave(wrapper);

    expect(onTags(container)).toHaveLength(0);
  });

  it("does not highlight anything when a tag is hovered after leaving the wrapper", () => {
    const { container } = render(<Fixture />);
    const wrapper = container.firstElementChild as HTMLElement;

    fireEvent.mouseOver(tagsFor(container, "python")[0]);
    fireEvent.mouseLeave(wrapper);
    expect(onTags(container)).toHaveLength(0);

    fireEvent.mouseOver(tagsFor(container, "python")[0]);
    expect(tagsFor(container, "python")[0]).toHaveAttribute("data-on");
  });
});
