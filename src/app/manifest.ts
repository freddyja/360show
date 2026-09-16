import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "360show",
    short_name: "360show",
    description: "360 photo booth operator",
    start_url: "/",
    display: "standalone",
    background_color: "#1a0533",
    theme_color: "#3b0764",
    orientation: "any",
  };
}
