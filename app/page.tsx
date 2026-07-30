import Link from "next/link";
import {
  ArrowRight,
  Braces,
  FileCode2,
  GitBranch,
  Route,
  Sparkles,
} from "lucide-react";
import { siteConfig } from "@/config/site";

const views = [
  {
    icon: GitBranch,
    eyebrow: "Trace",
    title: "See every turn",
    copy: "Move from a dense workflow file to a clear, explorable map of steps, decisions, and outcomes.",
  },
  {
    icon: Route,
    eyebrow: "Understand",
    title: "Follow the conversation",
    copy: "Switch to a sequence view and see how each source participates in the workflow.",
  },
  {
    icon: Braces,
    eyebrow: "Shape",
    title: "Add what comes next",
    copy: "Drag API operations into a visual flow, refine each step, and insert valid YAML without rewriting the rest.",
  },
];

export default function Home() {
  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="Primary navigation">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>{siteConfig.productName}</span>
        </Link>
        <Link className="nav-cta" href="/workspace">
          Open workspace
          <ArrowRight size={15} strokeWidth={2} />
        </Link>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">
            <Sparkles size={14} />
            A local-first Arazzo workspace
          </p>
          <h1>
            Map the way
            <br />
            your APIs <em>work.</em>
          </h1>
          <p className="hero-intro">
            Explore your API workflow collection, understand every hand-off,
            and compose new journeys with each OpenAPI source close at hand.
          </p>
          <div className="hero-actions">
            <Link className="primary-button" href="/workspace">
              Explore API workflows
              <ArrowRight size={18} />
            </Link>
            <a
              className="text-link"
              href="https://spec.openapis.org/arazzo/latest.html"
              target="_blank"
              rel="noreferrer"
            >
              Read the Arazzo specification
            </a>
          </div>
          <div className="trust-row" aria-label="Product qualities">
            <span>Browser-local drafts</span>
            <span>No account required</span>
            <span>Valid YAML out</span>
          </div>
        </div>

        <div className="hero-visual" aria-label="Workflow preview">
          <div className="visual-noise" />
          <div className="visual-header">
            <span className="visual-file">
              <FileCode2 size={15} />
              {siteConfig.defaultDocumentName}
            </span>
            <span className="visual-status">Published baseline</span>
          </div>
          <div className="workflow-preview">
            <div className="preview-node preview-node--input">
              <span className="node-index">00</span>
              <div>
                <small>Workflow input</small>
                <strong>worker_email</strong>
              </div>
            </div>
            <span className="preview-line preview-line--one" />
            <div className="preview-node preview-node--step preview-node--offset">
              <span className="node-index">01</span>
              <div>
                <small>GET · Deel</small>
                <strong>Find a worker</strong>
              </div>
            </div>
            <span className="preview-line preview-line--two" />
            <div className="preview-node preview-node--step">
              <span className="node-index">02</span>
              <div>
                <small>GET · Deel</small>
                <strong>Load contracts</strong>
              </div>
            </div>
            <span className="preview-line preview-line--three" />
            <div className="preview-node preview-node--output preview-node--offset">
              <span className="node-index">03</span>
              <div>
                <small>Workflow output</small>
                <strong>active_contracts</strong>
              </div>
            </div>
          </div>
          <div className="visual-caption">
            <span>01 / 04</span>
            <p>From raw descriptions to readable choreography.</p>
          </div>
        </div>
      </section>

      <section className="manifesto">
        <div>
          <p className="section-label">One source, several perspectives</p>
          <h2>
            Your workflow is more than
            <br />
            a wall of YAML.
          </h2>
        </div>
        <p>
          {siteConfig.productName} keeps the document at the centre. Every diagram, detail
          panel, and builder action is another view of the same portable file.
        </p>
      </section>

      <section className="feature-grid">
        {views.map(({ icon: Icon, eyebrow, title, copy }, index) => (
          <article className="feature-card" key={title}>
            <div className="feature-number">0{index + 1}</div>
            <Icon size={24} strokeWidth={1.6} />
            <p>{eyebrow}</p>
            <h3>{title}</h3>
            <span>{copy}</span>
          </article>
        ))}
      </section>

      <footer className="landing-footer">
        <div className="brand brand--footer">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>{siteConfig.productName}</span>
        </div>
        <p>Built for understanding. Yours to extend.</p>
      </footer>
    </main>
  );
}
