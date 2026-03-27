import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { SCHEMA_VERSION } from "@/app/lib/diagram/types";

export async function GET() {
  let commitCount = 0;
  try {
    commitCount = parseInt(execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim(), 10) || 0;
  } catch {}

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
