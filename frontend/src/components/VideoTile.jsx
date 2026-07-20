import React, { useEffect, useRef } from "react";

export function VideoTile({ label, meta, stream, muted = false, local = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null;
    }
  }, [stream]);

  return (
    <article className={`group overflow-hidden rounded-lg border shadow-xl shadow-slate-950/10 transition duration-300 hover:-translate-y-1 hover:shadow-2xl ${local ? "border-cyan-300/50 bg-cyan-950" : "border-slate-800 bg-slate-950"}`}>
      <div className="relative aspect-video bg-slate-900">
        {stream ? (
          <video ref={videoRef} autoPlay playsInline muted={muted} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_center,#164e63,#020617)]">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-white/10 text-3xl font-black text-white ring-1 ring-white/20">
              {label?.slice(0, 1)?.toUpperCase() || "?"}
            </span>
          </div>
        )}
        <div className="absolute left-3 top-3 rounded-md bg-black/45 px-2 py-1 text-xs font-semibold text-white backdrop-blur">
          {local ? "You" : "Participant"}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="min-w-0">
          <strong className="block truncate text-sm">{label}</strong>
          <span className="block truncate text-xs text-slate-300">{meta}</span>
        </div>
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/40" />
      </div>
    </article>
  );
}
