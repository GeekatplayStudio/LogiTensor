"use client";

import React from "react";
import { GraduationCap, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNodeEditorStore } from "@/components/node-editor/use-node-editor-store";
import { LESSONS } from "@/lib/device-lab/lessons";

// Learning panel: guided lessons stepping the user through real hardware
// workflows. Progress lives in the store so it survives route changes.

export default function LessonPanel() {
  const activeLessonId = useNodeEditorStore((s) => s.deviceActiveLessonId);
  const lessonStep = useNodeEditorStore((s) => s.deviceLessonStep);
  const setDeviceLesson = useNodeEditorStore((s) => s.setDeviceLesson);
  const setDeviceLessonStep = useNodeEditorStore((s) => s.setDeviceLessonStep);

  const lesson = LESSONS.find((l) => l.id === activeLessonId);

  return (
    <section className="rounded-lg border border-zinc-800/80 bg-zinc-950/85 backdrop-blur-md shadow-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <GraduationCap className="w-3.5 h-3.5 text-[#8A9BAD]" />
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Learn</h2>
        {lesson && (
          <button onClick={() => setDeviceLesson(null)} className="ml-auto text-zinc-500 hover:text-zinc-200 cursor-pointer" title="Back to lesson list">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {!lesson && (
        <div className="space-y-1">
          {LESSONS.map((l) => (
            <button
              key={l.id}
              onClick={() => setDeviceLesson(l.id)}
              className="w-full text-left rounded-md border border-zinc-800/70 hover:border-zinc-700 bg-zinc-900/40 px-2 py-1.5 cursor-pointer transition-all"
            >
              <div className="text-[11px] font-bold text-zinc-200">{l.title}</div>
              <div className="text-[10px] text-zinc-500 leading-snug">{l.summary}</div>
            </button>
          ))}
        </div>
      )}

      {lesson && (
        <div>
          <div className="text-[11px] font-bold text-zinc-200 mb-1">{lesson.title}</div>
          <div className="flex items-center gap-1 mb-2">
            {lesson.steps.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full ${i <= lessonStep ? "bg-[#8A9BAD]" : "bg-zinc-800"}`}
              />
            ))}
          </div>
          <div className="rounded-md border border-zinc-800/70 bg-zinc-900/40 p-2 min-h-24">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#B3C0CE] mb-1">
              Step {lessonStep + 1} of {lesson.steps.length}: {lesson.steps[lessonStep]?.title}
            </div>
            <p className="text-[11px] text-zinc-300 leading-relaxed">
              {lesson.steps[lessonStep]?.text}
            </p>
          </div>
          <div className="flex justify-between mt-2">
            <Button variant="outline" size="sm" onClick={() => setDeviceLessonStep(lessonStep - 1)} disabled={lessonStep === 0} className="h-6 px-2 text-[10px] border-zinc-800 text-zinc-400 hover:bg-zinc-800">
              <ChevronLeft className="w-3 h-3" /> Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                lessonStep + 1 < lesson.steps.length
                  ? setDeviceLessonStep(lessonStep + 1)
                  : setDeviceLesson(null)
              }
              className="h-6 px-2 text-[10px] border-zinc-800 text-zinc-400 hover:bg-zinc-800"
            >
              {lessonStep + 1 < lesson.steps.length ? (
                <>
                  Next <ChevronRight className="w-3 h-3" />
                </>
              ) : (
                "Finish"
              )}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
