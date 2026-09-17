import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "360show",
    short_name: "360show",
    description: "360 photo booth operator",
    start_url: "/",
    display: "standalone",
    background_color: "#db2777",
    theme_color: "#db2777",
    orientation: "any",
  };
}
