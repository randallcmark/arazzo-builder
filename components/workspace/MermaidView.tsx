"use client";

import mermaid from "mermaid";
import { useEffect, useId, useState } from "react";

export function MermaidView({ chart }: { chart: string }) {
  const reactId = useId();
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: {
        fontFamily: "var(--font-sans)",
        primaryColor: "#ffffff",
        primaryTextColor: "#20204b",
        primaryBorderColor: "#5b68f6",
        lineColor: "#8d84dc",
        secondaryColor: "#e7e5ff",
        tertiaryColor: "#ffd447",
        noteBkgColor: "#fff3b5",
        noteTextColor: "#20204b",
        actorBkg: "#ffffff",
        actorBorder: "#5b68f6",
        actorTextColor: "#20204b",
        signalColor: "#7454e8",
        signalTextColor: "#20204b",
      },
      flowchart: {
        htmlLabels: false,
        curve: "basis",
        useMaxWidth: true,
      },
    });

    const render = async () => {
      try {
        const id = `mermaid-${reactId.replace(/:/g, "")}-${Date.now()}`;
        const result = await mermaid.render(id, chart);
        if (active) {
          setSvg(result.svg);
          setError("");
        }
      } catch (caught) {
        if (active) {
          setSvg("");
          setError(caught instanceof Error ? caught.message : "Unable to render diagram.");
        }
      }
    };
    void render();
    return () => {
      active = false;
    };
  }, [chart, reactId]);

  if (error) {
    return (
      <div className="diagram-error">
        <strong>Diagram unavailable</strong>
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div
      className="mermaid-view"
      aria-label="Generated workflow diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
