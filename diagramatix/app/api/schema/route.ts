import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { SCHEMA_VERSION } from "@/app/lib/diagram/types";

export async function GET() {
  // Commit count is baked into the build via NEXT_PUBLIC_COMMIT_COUNT
  // (set from --build-arg GIT_COMMIT_COUNT in the Dockerfile). Falls
  // back to "0" in containers without git or in dev runs.
  const commitCount = parseInt(process.env.NEXT_PUBLIC_COMMIT_COUNT ?? "0", 10) || 0;

  const appVersion = `${SCHEMA_VERSION}.${commitCount}`;

  const xsdPath = join(process.cwd(), "public", "diagramatix-export.xsd");
  const xsdTemplate = readFileSync(xsdPath, "utf8");
  const xsd = xsdTemplate
    .replace("{{SCHEMA_VERSION}}", SCHEMA_VERSION)
    .replace("{{APP_VERSION}}", appVersion);

  return new NextResponse(xsd, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `inline; filename="diagramatix-export-v${appVersion}.xsd"`,
    },
  });
}
