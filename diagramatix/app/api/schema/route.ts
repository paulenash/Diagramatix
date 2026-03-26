import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { EXPORT_VERSION } from "@/app/lib/diagram/types";

export async function GET() {
  let commitCount = 0;
  try {
    commitCount = parseInt(execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim(), 10) || 0;
  } catch {}

  const fullVersion = `${EXPORT_VERSION}.${commitCount}`;

  const xsdPath = join(process.cwd(), "public", "diagramatix-export.xsd");
  const xsdTemplate = readFileSync(xsdPath, "utf8");
  const xsd = xsdTemplate.replace("{{DIAGRAMATIX_VERSION}}", fullVersion);

  return new NextResponse(xsd, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `inline; filename="diagramatix-export-v${fullVersion}.xsd"`,
    },
  });
}
