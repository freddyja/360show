import { ImageResponse } from "next/og";

export const dynamic = "force-static";

/** 512px icon so Android Chrome offers "Install app" for the tablet remote. */
export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07101c",
          color: "#22d3ee",
          fontSize: 200,
          fontWeight: 800,
          borderRadius: 96,
        }}
      >
        360
      </div>
    ),
    { width: 512, height: 512 },
  );
}
