import React, { useEffect, useRef } from "react";

export function VideoTile({ label, meta, stream, muted = false, local = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null;
    }
  }, [stream]);

  return (
    <article className={`videoTile ${local ? "videoTileLocal" : ""}`}>
      <div className="videoFrame">
        {stream ? (
          <video ref={videoRef} autoPlay playsInline muted={muted} />
        ) : (
          <div className="videoPlaceholder">
            <span>{label?.slice(0, 1)?.toUpperCase() || "?"}</span>
          </div>
        )}
      </div>
      <div className="videoMeta">
        <strong>{label}</strong>
        <span>{meta}</span>
      </div>
    </article>
  );
}
