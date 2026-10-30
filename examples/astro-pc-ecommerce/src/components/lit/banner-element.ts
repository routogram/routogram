import { css, html, LitElement } from "lit";

export class BannerElement extends LitElement {
  static [Symbol.for("tagName")] = "banner-element";

  static styles = css`
    :host {
      display: block;
    }
    .banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      border: 1px solid rgb(168 85 247 / 0.3);
      border-radius: 0.75rem;
      background: linear-gradient(110deg, rgb(168 85 247 / 0.14), rgb(34 211 238 / 0.06));
      padding: 1rem 1.25rem;
    }
    .eyebrow {
      margin: 0 0 0.35rem;
      color: rgb(216 180 254);
      font-size: 0.6rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .title {
      margin: 0;
      color: rgb(244 244 245);
      font-size: 0.95rem;
      font-weight: 600;
    }
    .copy {
      margin: 0.25rem 0 0;
      color: rgb(161 161 170);
      font-size: 0.7rem;
    }
    .badge {
      flex-shrink: 0;
      border: 1px solid rgb(168 85 247 / 0.3);
      border-radius: 999px;
      background: rgb(168 85 247 / 0.12);
      padding: 0.3rem 0.65rem;
      color: rgb(216 180 254);
      font-size: 0.55rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
  `;

  render() {
    return html`
      <div class="banner">
        <div>
          <p class="eyebrow">Limited launch allocation</p>
          <p class="title">Nova Titan X — built for 4K simulation and local AI.</p>
          <p class="copy">Reserve today and lock in launch pricing. Ships in 5–7 days.</p>
        </div>
        <span class="badge">Lit element</span>
      </div>
    `;
  }
}

if (!customElements.get("banner-element")) {
  customElements.define("banner-element", BannerElement);
}
