"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { dragHasFiles, pickFile, readDroppedText } from "@/lib/file-drop";

/** Marks an element as a file drop zone; used for the "wrong target" hint. */
export const DROP_ZONE_ATTR = "data-file-drop";

export interface FileDropOptions {
  /** Accepted extensions — pass a module-level constant so handlers stay stable. */
  extensions: readonly string[];
  /** Called with the dropped file and its text once it has been read. */
  onFile: (file: File, text: string) => void;
  /** Human-readable label used in the "unsupported file" message. */
  label: string;
}

export interface FileDropZone {
  /** True while a file drag hovers this zone — drives the drop overlay. */
  isOver: boolean;
  dropZoneProps: {
    [DROP_ZONE_ATTR]: string;
    onDragEnter: (event: React.DragEvent) => void;
    onDragOver: (event: React.DragEvent) => void;
    onDragLeave: (event: React.DragEvent) => void;
  };
  /** Call from the element's own onDrop; true means the file was handled here. */
  handleDrop: (event: React.DragEvent) => boolean;
}

/**
 * Turns any element into a file drop zone. Drags that carry in-app payloads
 * (the node palette) are ignored entirely, so a zone can host both: the canvas
 * still receives `application/reactflow` drops through its own handler.
 */
export function useFileDrop({ extensions, onFile, label }: FileDropOptions): FileDropZone {
  const [isOver, setIsOver] = useState(false);
  // dragenter/dragleave fire for every child element; count them so the
  // overlay doesn't flicker as the pointer crosses nodes inside the zone.
  const depth = useRef(0);

  const onDragEnter = useCallback((event: React.DragEvent) => {
    if (!dragHasFiles(event.dataTransfer?.types)) return;
    depth.current += 1;
    setIsOver(true);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    if (!dragHasFiles(event.dataTransfer?.types)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDragLeave = useCallback((event: React.DragEvent) => {
    if (!dragHasFiles(event.dataTransfer?.types)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setIsOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent): boolean => {
      const files = Array.from(event.dataTransfer?.files ?? []);
      depth.current = 0;
      setIsOver(false);
      if (files.length === 0) return false;

      event.preventDefault();
      const file = pickFile(files, extensions);
      if (!file) {
        toast.error(`${files[0].name} is not a ${label} (expected ${extensions.join(", ")})`);
        return true;
      }
      readDroppedText(file)
        .then((text) => onFile(file, text))
        .catch((err: unknown) => toast.error(err instanceof Error ? err.message : String(err)));
      return true;
    },
    [extensions, onFile, label]
  );

  return {
    isOver,
    dropZoneProps: { [DROP_ZONE_ATTR]: label, onDragEnter, onDragOver, onDragLeave },
    handleDrop,
  };
}

/**
 * App-level guard: a file dropped anywhere outside a drop zone would otherwise
 * make the browser navigate to it, silently throwing away the session. Swallow
 * those drops and point at the zones instead. Mount once, at the app shell.
 */
export function useBlockStrayFileDrops() {
  useEffect(() => {
    const allowDrop = (event: DragEvent) => {
      if (dragHasFiles(event.dataTransfer?.types)) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (!dragHasFiles(event.dataTransfer?.types)) return;
      event.preventDefault();
      const target = event.target as HTMLElement | null;
      if (target?.closest(`[${DROP_ZONE_ATTR}]`)) return; // a zone already took it
      toast.info("Drop a flow JSON on the canvas, or source code on the code panel");
    };
    window.addEventListener("dragover", allowDrop);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", allowDrop);
      window.removeEventListener("drop", onDrop);
    };
  }, []);
}
