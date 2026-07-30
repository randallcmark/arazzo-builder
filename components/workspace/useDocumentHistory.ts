import { useCallback, useEffect, useRef, useState } from "react";

const HISTORY_LIMIT = 100;
const YAML_HISTORY_DELAY_MS = 750;

export function useDocumentHistory() {
  const [source, setSource] = useState("");
  const sourceRef = useRef("");
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const yamlHistoryStart = useRef<string | null>(null);
  const yamlHistoryTimer = useRef<number | null>(null);
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });

  const syncHistoryState = useCallback(() => {
    setHistoryState({
      canUndo:
        undoStack.current.length > 0 || yamlHistoryStart.current !== null,
      canRedo: redoStack.current.length > 0,
    });
  }, []);

  const clearYamlTimer = useCallback(() => {
    if (yamlHistoryTimer.current !== null) {
      window.clearTimeout(yamlHistoryTimer.current);
      yamlHistoryTimer.current = null;
    }
  }, []);

  const finalizeYamlHistory = useCallback(() => {
    clearYamlTimer();
    const start = yamlHistoryStart.current;
    yamlHistoryStart.current = null;
    if (start === null || start === sourceRef.current) return;
    undoStack.current.push(start);
    if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
    redoStack.current = [];
    syncHistoryState();
  }, [clearYamlTimer, syncHistoryState]);

  const replaceSource = useCallback((nextSource: string, recordHistory = true) => {
    finalizeYamlHistory();
    const currentSource = sourceRef.current;
    if (nextSource === currentSource) return;
    if (recordHistory && currentSource) {
      undoStack.current.push(currentSource);
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
      redoStack.current = [];
    }
    sourceRef.current = nextSource;
    setSource(nextSource);
    syncHistoryState();
  }, [finalizeYamlHistory, syncHistoryState]);

  const resetSource = useCallback((nextSource: string) => {
    clearYamlTimer();
    sourceRef.current = nextSource;
    setSource(nextSource);
    yamlHistoryStart.current = null;
    undoStack.current = [];
    redoStack.current = [];
    setHistoryState({ canUndo: false, canRedo: false });
  }, [clearYamlTimer]);

  const handleYamlChange = useCallback((nextSource: string) => {
    if (nextSource === sourceRef.current) return;
    if (yamlHistoryStart.current === null) {
      yamlHistoryStart.current = sourceRef.current;
      syncHistoryState();
    }
    clearYamlTimer();
    sourceRef.current = nextSource;
    setSource(nextSource);
    yamlHistoryTimer.current = window.setTimeout(
      finalizeYamlHistory,
      YAML_HISTORY_DELAY_MS,
    );
  }, [clearYamlTimer, finalizeYamlHistory, syncHistoryState]);

  const undo = useCallback((): boolean => {
    finalizeYamlHistory();
    const previous = undoStack.current.pop();
    if (previous === undefined) return false;
    redoStack.current.push(sourceRef.current);
    sourceRef.current = previous;
    setSource(previous);
    syncHistoryState();
    return true;
  }, [finalizeYamlHistory, syncHistoryState]);

  const redo = useCallback((): boolean => {
    finalizeYamlHistory();
    const next = redoStack.current.pop();
    if (next === undefined) return false;
    undoStack.current.push(sourceRef.current);
    sourceRef.current = next;
    setSource(next);
    syncHistoryState();
    return true;
  }, [finalizeYamlHistory, syncHistoryState]);

  useEffect(() => () => clearYamlTimer(), [clearYamlTimer]);

  return {
    source,
    sourceRef,
    replaceSource,
    resetSource,
    handleYamlChange,
    undo,
    redo,
    ...historyState,
  };
}
