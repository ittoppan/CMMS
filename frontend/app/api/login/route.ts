export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8081";
    const res = await fetch(`${apiUrl}/api/auth/login.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      credentials: "include",
    });

    const data = await res.json();

    if (res.ok && data.success) {
      const setCookie = res.headers.get("set-cookie");
      const headers: Record<string, string> = {};
      if (setCookie) {
        headers["set-cookie"] = setCookie;
      }
      return Response.json(data, { status: 200, headers });
    }

    return Response.json(data, { status: 401 });
  } catch {
    return Response.json(
      { success: false, message: "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง" },
      { status: 500 }
    );
  }
}
