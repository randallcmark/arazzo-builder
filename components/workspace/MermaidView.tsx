"use client";

import {
  Hand,
  Minus,
  MousePointer2,
  Plus,
  RotateCcw,
  StretchHorizontal,
} from "lucide-react";
import mermaid from "mermaid";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.15;

type DiagramSize = { width: number; height: number };

export function MermaidView({
  chart,
  interactiveStepIds = [],
  messageStepIds,
  selectedStepId = null,
  onStepSelect,
  onStepClear,
  detailBubble,
}: {
  chart: string;
  interactiveStepIds?: string[];
  messageStepIds?: Array<string | null>;
  selectedStepId?: string | null;
  onStepSelect?: (stepId: string) => void;
  onStepClear?: () => void;
  detailBubble?: ReactNode;
}) {
  const reactId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const diagramSize = useRef<DiagramSize | null>(null);
  const panStart = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const panMoved = useRef(false);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [panEnabled, setPanEnabled] = useState(false);

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
        noteBkgColor: "#f1f0ff",
        noteBorderColor: "#cbc7ed",
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
      sequence: {
        actorMargin: 54,
        messageMargin: 28,
        noteMargin: 8,
        mirrorActors: false,
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
          setPanEnabled(false);
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
    const viewport = viewportRef.current;
    const width = diagram?.viewBox?.baseVal.width;
    const height = diagram?.viewBox?.baseVal.height;
    if (diagram && viewport && width && height) {
      diagramSize.current = { width, height };
      applyDiagramSize(diagram, { width, height }, 1);
      window.requestAnimationFrame(() => scrollToTopCenter(viewport));
    }
  }, [svg]);

  useEffect(() => {
    const diagram = containerRef.current?.querySelector<SVGSVGElement>("svg");
    if (diagram && diagramSize.current) {
      applyDiagramSize(diagram, diagramSize.current, zoom);
    }
  }, [svg, zoom]);

  useEffect(() => {
    const labels = containerRef.current?.querySelectorAll<SVGElement>(
      ".messageText",
    );
    const lines = containerRef.current?.querySelectorAll<SVGElement>(
      ".messageLine0, .messageLine1",
    );
    decorateMessages(
      labels,
      interactiveStepIds,
      messageStepIds,
      selectedStepId,
      true,
    );
    decorateMessages(
      lines,
      interactiveStepIds,
      messageStepIds,
      selectedStepId,
      false,
    );
  }, [interactiveStepIds, messageStepIds, selectedStepId, svg]);

  const changeZoom = useCallback((nextZoom: number) => {
    const viewport = viewportRef.current;
    const clamped = clampZoom(nextZoom);
    if (!viewport || clamped === zoom) return;
    const scale = clamped / zoom;
    const centerX = viewport.scrollLeft + viewport.clientWidth / 2;
    const centerY = viewport.scrollTop + viewport.clientHeight / 2;
    setZoom(clamped);
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = centerX * scale - viewport.clientWidth / 2;
      viewport.scrollTop = centerY * scale - viewport.clientHeight / 2;
    });
  }, [zoom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      changeZoom(zoom - event.deltaY * 0.002);
    };
    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [changeZoom, zoom]);

  const fitWidth = () => {
    const viewport = viewportRef.current;
    const size = diagramSize.current;
    if (!viewport || !size?.width) return;
    const nextZoom = clampZoom((viewport.clientWidth - 72) / size.width);
    setZoom(nextZoom);
    window.requestAnimationFrame(() => scrollToTopCenter(viewport));
  };

  const resetView = () => {
    const viewport = viewportRef.current;
    setZoom(1);
    setPanEnabled(false);
    if (viewport) {
      window.requestAnimationFrame(() => scrollToTopCenter(viewport));
    }
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
        if (panEnabled) return;
        const target = event.target as Element;
        if (target.closest(".diagram-toolbar, .sequence-step-bubble")) return;
        const selectable = target.closest<SVGElement>("[data-step-id]");
        if (selectable?.dataset.stepId) {
          onStepSelect?.(selectable.dataset.stepId);
        } else {
          onStepClear?.();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onStepClear?.();
          return;
        }
        if (event.key !== "Enter" && event.key !== " ") return;
        const selectable = (event.target as Element).closest<SVGElement>(
          "[data-step-id]",
        );
        if (!selectable?.dataset.stepId) return;
        event.preventDefault();
        onStepSelect?.(selectable.dataset.stepId);
      }}
    >
      <div className="diagram-toolbar" aria-label="Sequence diagram controls">
        <button
          className={`icon-button ${panEnabled ? "is-active" : ""}`}
          onClick={() => setPanEnabled((current) => !current)}
          aria-label={panEnabled ? "Use selection mode" : "Enable pan mode"}
          aria-pressed={panEnabled}
          title={panEnabled ? "Selection mode" : "Pan mode"}
        >
          {panEnabled ? <MousePointer2 size={14} /> : <Hand size={14} />}
        </button>
        <span className="diagram-toolbar-divider" />
        <button
          className="icon-button"
          onClick={() => changeZoom(zoom - ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus size={15} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          className="icon-button"
          onClick={() => changeZoom(zoom + ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Plus size={15} />
        </button>
        <button
          className="icon-button"
          onClick={fitWidth}
          aria-label="Fit diagram width"
          title="Fit width and return to top"
        >
          <StretchHorizontal size={14} />
        </button>
        <button
          className="icon-button"
          onClick={resetView}
          aria-label="Reset diagram to actual size"
          title="Actual size and return to top"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {interactiveStepIds.length > 0 && (
        <span className="diagram-interaction-hint">
          {panEnabled
            ? "Pan mode · drag the canvas"
            : "Select a call for details · scroll to move"}
        </span>
      )}

      {detailBubble && (
        <div
          className="sequence-step-bubble-layer"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {detailBubble}
        </div>
      )}

      <div
        ref={viewportRef}
        className={`mermaid-viewport ${panEnabled ? "is-pan-enabled" : ""}`}
        tabIndex={0}
        onPointerDown={(event) => {
          if (!panEnabled || event.button !== 0) return;
          const viewport = event.currentTarget;
          panMoved.current = false;
          panStart.current = {
            x: event.clientX,
            y: event.clientY,
            left: viewport.scrollLeft,
            top: viewport.scrollTop,
          };
          viewport.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = panStart.current;
          if (!start) return;
          const deltaX = event.clientX - start.x;
          const deltaY = event.clientY - start.y;
          if (Math.abs(deltaX) + Math.abs(deltaY) > 4) {
            panMoved.current = true;
          }
          event.currentTarget.scrollLeft = start.left - deltaX;
          event.currentTarget.scrollTop = start.top - deltaY;
        }}
        onPointerUp={(event) => {
          if (!panStart.current) return;
          panStart.current = null;
          event.currentTarget.releasePointerCapture?.(event.pointerId);
        }}
        onPointerCancel={() => {
          panStart.current = null;
        }}
      >
        <div
          ref={containerRef}
          className="mermaid-diagram-surface"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
}

function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function applyDiagramSize(
  diagram: SVGSVGElement,
  size: DiagramSize,
  zoom: number,
) {
  diagram.style.width = `${size.width * zoom}px`;
  diagram.style.height = `${size.height * zoom}px`;
  diagram.style.maxWidth = "none";
  diagram.style.maxHeight = "none";
}

function scrollToTopCenter(viewport: HTMLDivElement) {
  viewport.scrollTop = 0;
  viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
}

function decorateMessages(
  elements: NodeListOf<SVGElement> | undefined,
  interactiveStepIds: string[],
  messageStepIds: Array<string | null> | undefined,
  selectedStepId: string | null,
  keyboardAccessible: boolean,
) {
  elements?.forEach((element, index) => {
    const stepId = messageStepIds
      ? messageStepIds[index]
      : interactiveStepIds[Math.floor(index / 2)];
    if (!stepId) {
      delete element.dataset.stepId;
      element.removeAttribute("role");
      element.removeAttribute("tabindex");
      element.classList.remove("is-selected-message");
      return;
    }
    element.dataset.stepId = stepId;
    element.setAttribute("aria-label", `Inspect workflow step ${stepId}`);
    if (keyboardAccessible) {
      element.setAttribute("role", "button");
      element.setAttribute("tabindex", "0");
    }
    element.classList.toggle("is-selected-message", stepId === selectedStepId);
  });
}
