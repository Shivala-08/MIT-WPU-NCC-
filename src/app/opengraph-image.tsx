import { ImageResponse } from "next/og";
import { Shield } from "lucide-react";

export const runtime = "edge";

export const alt = "NCC MIT WPU | Unity and Discipline";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function og() {
  const fontData = await fetch(
    "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff2"
  ).then((res) => res.arrayBuffer());
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          background: "linear-gradient(135deg, #0a1628 0%, #11234a 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px",
          boxSizing: "border-box",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div
          style={{
            width: "96px",
            height: "96px",
            borderRadius: "50%",
            background: "#b31b1b",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
            marginBottom: "28px",
          }}
        >
          <Shield
            size={48}
            color="#ffffff"
            strokeWidth={2.5}
          />
        </div>

        <div
          style={{
            color: "#ffffff",
            textAlign: "center",
            maxWidth: "820px",
          }}
        >
          <div
            style={{
              display: "inline-block",
              padding: "4px 12px",
              border: "1px solid rgba(218,165,32,0.7)",
              borderRadius: "999px",
              backgroundColor: "rgba(218,165,32,0.12)",
              color: "#f4d76e",
              fontSize: "16px",
              fontWeight: "700",
              letterSpacing: "2px",
              textTransform: "uppercase",
              marginBottom: "18px",
            }}
          >
            National Cadet Corps
          </div>          <h1
            style={{
              fontSize: "60px",
              fontWeight: 800,
              lineHeight: "1.05",
              margin: "0 0 12px 0",
              color: "#ffffff",
            }}
          >
            NCC MIT World Peace{" "}
            <span style={{ color: "#f4d76e" }}>University</span>
          </h1>          <p
            style={{
              fontSize: "24px",
              fontWeight: 500,
              color: "rgba(255,255,255,0.85)",
              margin: "0 0 28px 0",
            }}
          >
            Unity and Discipline
          </p>

          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            {[
              { label: "Pune, Maharashtra", value: "India" },
              { label: "Cadet Portal", value: "Active" },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  padding: "6px 14px",
                  background: "rgba(255,255,255,0.08)",
                  borderRadius: "999px",            color: "rgba(255,255,255,0.9)",            fontSize: "14px",
                }}
              >
                {item.label}: {item.value}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: "40px",
            color: "rgba(255,255,255,0.5)",
            fontSize: "14px",
            letterSpacing: "1px",
          }}
        >
          ncc.mitwpu.edu.in
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: fontData, style: "normal", weight: 400 },
        { name: "Inter", data: fontData, style: "normal", weight: 500 },
        { name: "Inter", data: fontData, style: "normal", weight: 700 },
        { name: "Inter", data: fontData, style: "normal", weight: 800 },
      ],
    }
  );
}
