import { prisma } from "@/app/lib/db";

export default async function TestDbPage() {
  let result = "not tested";
  try {
    const users = await prisma.user.findMany({ select: { email: true, name: true } });
    result = JSON.stringify(users);
  } catch (e) {
    result = "ERROR: " + (e instanceof Error ? e.message : String(e));
  }

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>DB Test</h1>
      <p>Users: {result}</p>
    </div>
  );
}
