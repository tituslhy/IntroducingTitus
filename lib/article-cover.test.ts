import { COVER_WIDTH, coverFromBody, coverFromOgImage, sizedCover } from "./article-cover";

describe("COVER_WIDTH", () => {
  it("asks Medium for 1400 pixels", () => {
    expect(COVER_WIDTH).toBe(1400);
  });
});

describe("sizedCover", () => {
  it("rewrites the size in a Medium export URL (/max/<n>/)", () => {
    expect(sizedCover("https://cdn-images-1.medium.com/max/800/1*abc123.png")).toBe(
      "https://cdn-images-1.medium.com/max/1400/1*abc123.png",
    );
  });

  it("rewrites the size in a saved-page URL (resize:fit:<n>)", () => {
    expect(sizedCover("https://miro.medium.com/v2/resize:fit:930/1*xyz.jpeg")).toBe(
      "https://miro.medium.com/v2/resize:fit:1400/1*xyz.jpeg",
    );
  });

  it("also grows a small size up to COVER_WIDTH", () => {
    expect(sizedCover("https://cdn-images-1.medium.com/max/300/1*a.png")).toContain("/max/1400/");
  });

  it("leaves a URL with no size marker unchanged", () => {
    const url = "https://example.com/images/cover.png";
    expect(sizedCover(url)).toBe(url);
  });

  it("only rewrites the first size marker", () => {
    expect(sizedCover("https://cdn.example.com/max/800/notes/max/2000/x.png")).toBe(
      "https://cdn.example.com/max/1400/notes/max/2000/x.png",
    );
  });
});

describe("coverFromBody", () => {
  const figure = (inner: string, open = "<figure>") => `<p>Intro.</p>${open}${inner}</figure><p>More.</p>`;
  const img = (src: string) => `<img src="${src}" />`;
  const MEDIUM = "https://cdn-images-1.medium.com/max/800/1*abc.png";

  it("returns the first figure's image, sized for the page", () => {
    expect(coverFromBody(figure(img(MEDIUM)))).toEqual({
      src: "https://cdn-images-1.medium.com/max/1400/1*abc.png",
    });
  });

  it("returns undefined when the post has no figure", () => {
    expect(coverFromBody('<p>Just prose, <img src="https://x.com/a.png" /></p>')).toBeUndefined();
  });

  it("returns undefined for an empty body", () => {
    expect(coverFromBody("")).toBeUndefined();
  });

  it("returns undefined when the figure has no image", () => {
    expect(coverFromBody(figure("<figcaption>A caption with no picture</figcaption>"))).toBeUndefined();
  });

  it("returns undefined when the image is not served over https", () => {
    expect(coverFromBody(figure(img("http://cdn.example.com/a.png")))).toBeUndefined();
  });

  it("returns undefined for a protocol-relative or data URL", () => {
    expect(coverFromBody(figure(img("//cdn.example.com/a.png")))).toBeUndefined();
    expect(coverFromBody(figure(img("data:image/png;base64,AAAA")))).toBeUndefined();
  });

  it("uses only the first figure, even when a later one has an image", () => {
    const body = `<figure><p>no picture here</p></figure><figure>${img(MEDIUM)}</figure>`;
    expect(coverFromBody(body)).toBeUndefined();
  });

  it("picks the first figure's image when there are several figures", () => {
    const body = `<figure>${img("https://cdn.example.com/max/800/first.png")}</figure><figure>${img("https://cdn.example.com/max/800/second.png")}</figure>`;
    expect(coverFromBody(body)?.src).toBe("https://cdn.example.com/max/1400/first.png");
  });

  it("reads the src when other attributes come before it", () => {
    const body = figure(`<img class="graf-image" alt="" src="${MEDIUM}" width="700" />`);
    expect(coverFromBody(body)?.src).toBe("https://cdn-images-1.medium.com/max/1400/1*abc.png");
  });

  it("does not mistake data-src for src", () => {
    const body = figure(`<img data-src="https://cdn.example.com/max/800/lazy.png" />`);
    expect(coverFromBody(body)).toBeUndefined();
  });

  it("accepts a figure with attributes on its opening tag", () => {
    expect(coverFromBody(figure(img(MEDIUM), '<figure class="graf graf--figure">'))?.src).toContain("/max/1400/");
  });

  it("returns the figcaption text when there is one", () => {
    const body = figure(`${img(MEDIUM)}<figcaption>Diagram of the retrieval loop</figcaption>`);
    expect(coverFromBody(body)).toEqual({
      src: "https://cdn-images-1.medium.com/max/1400/1*abc.png",
      caption: "Diagram of the retrieval loop",
    });
  });

  it("omits the caption key entirely when there is no figcaption", () => {
    const cover = coverFromBody(figure(img(MEDIUM)));
    expect(cover).not.toHaveProperty("caption");
  });

  it("omits the caption key when the figcaption is only whitespace or tags", () => {
    expect(coverFromBody(figure(`${img(MEDIUM)}<figcaption>   </figcaption>`))).not.toHaveProperty("caption");
    expect(coverFromBody(figure(`${img(MEDIUM)}<figcaption><em></em></figcaption>`))).not.toHaveProperty("caption");
  });

  it("decodes entities once, so a literal “&lt;” in the caption stays as written", () => {
    // &amp;lt; becomes the text "&lt;", not "<": &amp; is decoded last.
    const body = figure(`${img(MEDIUM)}<figcaption>Use &amp;lt;b&amp;gt; tags</figcaption>`);
    expect(coverFromBody(body)?.caption).toBe("Use &lt;b&gt; tags");
  });

  it("strips tags from the caption, keeping the words", () => {
    const body = figure(`${img(MEDIUM)}<figcaption>Photo by <a href="https://x.com">Jane</a> on <em>Unsplash</em></figcaption>`);
    expect(coverFromBody(body)?.caption).toBe("Photo by Jane on Unsplash");
  });

  it("decodes common HTML entities in the caption", () => {
    const body = figure(`${img(MEDIUM)}<figcaption>Tom&#39;s &amp; Jerry&nbsp;&quot;live&quot; &lt;3 &gt; &#x27;ok&#x27;</figcaption>`);
    expect(coverFromBody(body)?.caption).toBe("Tom's & Jerry \"live\" <3 > 'ok'");
  });

  it("collapses runs of whitespace in the caption", () => {
    const body = figure(`${img(MEDIUM)}<figcaption>\n  two\n\n   lines  </figcaption>`);
    expect(coverFromBody(body)?.caption).toBe("two lines");
  });

  it("returns the src sized for the page when the image sits inside a link", () => {
    const body = figure(`<a href="https://medium.com/x"><img src="${MEDIUM}" /></a>`);
    expect(coverFromBody(body)).toEqual({ src: "https://cdn-images-1.medium.com/max/1400/1*abc.png" });
  });
});

describe("coverFromOgImage", () => {
  it("returns the og:image as a cover, sized for the page", () => {
    expect(coverFromOgImage("https://miro.medium.com/v2/resize:fit:930/1*hero.png")).toEqual({
      src: "https://miro.medium.com/v2/resize:fit:1400/1*hero.png",
    });
  });

  it("never carries a caption, since saved pages have none for it", () => {
    expect(coverFromOgImage("https://cdn-images-1.medium.com/max/800/1*a.png")).not.toHaveProperty("caption");
  });

  it("returns undefined when there is no og:image", () => {
    expect(coverFromOgImage(undefined)).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(coverFromOgImage("")).toBeUndefined();
  });

  it("returns undefined for a non-https image", () => {
    expect(coverFromOgImage("http://cdn.example.com/a.png")).toBeUndefined();
    expect(coverFromOgImage("/images/local.png")).toBeUndefined();
  });
});
