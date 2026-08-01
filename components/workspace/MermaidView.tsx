"use client";

import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import mermaid from "mermaid";
import { useEffect, useId, useRef, useState } from "react";

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;

export function MermaidView({
  chart,
  interactiveStepIds = [],
  messageStepIds,
  selectedStepId = null,
  onStepSelect,
}: {
  chart: string;
  interactiveStepIds?: string[];
  messageStepIds?: Array<string | null>;
  selectedStepId?: string | null;
  onStepSelect?: (stepId: string) => void;
}) {
  const reactId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const panStart = useRef<{ x: number; y: number; left: number; top: number } | null>(
    null,
  );
  const panMoved = useRef(false);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

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
          setZoom(1);
          setOffset({ x: 0, y: 0 });
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

  useEffect(() => {
    const diagram = containerRef.current?.querySelector<SVGSVGElement>("svg");
    if (diagram?.viewBox.baseVal.width && diagram.viewBox.baseVal.height) {
      diagram.style.width = `${diagram.viewBox.baseVal.width}px`;
      diagram.style.height = `${diagram.viewBox.baseVal.height}px`;
      diagram.style.maxWidth = "none";
      diagram.style.maxHeight = "none";
    }

    const messageLabels =
      containerRef.current?.querySelectorAll<SVGElement>(".messageText");
    messageLabels?.forEach((label, index) => {
      const stepId = messageStepIds
        ? messageStepIds[index]
        : interactiveStepIds[Math.floor(index / 2)];
      if (!stepId) return;
      label.dataset.stepId = stepId;
      label.setAttribute("role", "button");
      label.setAttribute("tabindex", "0");
      label.setAttribute("aria-label", `Inspect workflow step ${stepId}`);
      label.classList.toggle("is-selected-message", stepId === selectedStepId);
    });
  }, [interactiveStepIds, messageStepIds, selectedStepId, svg]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        setZoom((current) =>
          Math.min(
            MAX_ZOOM,
            Math.max(MIN_ZOOM, current - event.deltaY * 0.002),
          ),
        );
      } else {
        setOffset((current) => ({
          x: current.x - event.deltaX,
          y: current.y - event.deltaY,
        }));
      }
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, []);

  const changeZoom = (nextZoom: number) => {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom)));
  };

  const fitDiagram = () => {
    const viewport = viewportRef.current;
    const diagram = containerRef.current?.querySelector<SVGSVGElement>("svg");
    if (!viewport || !diagram?.viewBox.baseVal.width) return;
    const nextZoom = Math.min(
      (viewport.clientWidth - 72) / diagram.viewBox.baseVal.width,
      (viewport.clientHeight - 72) / diagram.viewBox.baseVal.height,
      1,
    );
    changeZoom(nextZoom);
    setOffset({ x: 0, y: 0 });
  };

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
      className={`mermaid-view ${
        interactiveStepIds.length ? "mermaid-view--interactive" : ""
      }`}
      aria-label="Generated workflow sequence diagram"
      onClick={(event) => {
        if (panMoved.current) {
          panMoved.current = false;
          return;
        }
        const label = (event.target as Element).closest<SVGElement>(
          "[data-step-id]",
        );
        if (label?.dataset.stepId) onStepSelect?.(label.dataset.stepId);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const label = (event.target as Element).closest<SVGElement>(
          "[data-step-id]",
        );
        if (!label?.dataset.stepId) return;
        event.preventDefault();
        onStepSelect?.(label.dataset.stepId);
      }}
    >
      <div className="diagram-toolbar" aria-label="Sequence diagram controls">
        <button
          className="icon-button"
          onClick={() => changeZoom(zoom - 0.15)}
          disabled={zoom <= MIN_ZOOM}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus size={15} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          className="icon-button"
          onClick={() => changeZoom(zoom + 0.15)}
          disabled={zoom >= MAX_ZOOM}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Plus size={15} />
        </button>
        <button
          className="icon-button"
          onClick={fitDiagram}
          aria-label="Fit diagram"
          title="Fit diagram"
        >
          <Maximize2 size={14} />
        </button>
        <button
          className="icon-button"
          onClick={() => {
            setZoom(1);
            setOffset({ x: 0, y: 0 });
          }}
          aria-label="Reset diagram view"
          title="Reset to 100%"
        >
          <RotateCcw size={14} />
        </button>
      </div>
      {interactiveStepIds.length > 0 && (
        <span className="diagram-interaction-hint">
          Select a call to inspect · drag to pan
        </span>
      )}
      <div
        ref={viewportRef}
        className="mermaid-viewport"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          panMoved.current = false;
          panStart.current = {
            x: event.clientX,
            y: event.clientY,
            left: offset.x,
            top: offset.y,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = panStart.current;
          if (!start) return;
          const x = start.left + event.clientX - start.x;
          const y = start.top + event.clientY - start.y;
          if (Math.abs(x - start.left) + Math.abs(y - start.top) > 4) {
            panMoved.current = true;
          }
          setOffset({ x, y });
        }}
        onPointerUp={(event) => {
          panStart.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          panStart.current = null;
        }}
      >
        <div
          ref={containerRef}
          className="mermaid-diagram-surface"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
}
