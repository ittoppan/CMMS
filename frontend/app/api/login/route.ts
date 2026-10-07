export async function POST(request: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: "คำขอไม่ถูกต้อง กรุณาลองใหม่", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  try {
    const { username, password } = body;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8081";
    const res = await fetch(`${apiUrl}/api/auth/login.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      credentials: "include",
      cache: "no-store",
    });

    const text = await res.text();
    let data: {
      success?: boolean;
      error?: string;
      code?: string;
      must_change_password?: boolean;
      user?: Record<string, unknown>;
    } = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { success: false, code: "BAD_RESPONSE" };
    }

    if (res.ok && data.success) {
      const setCookie = res.headers.get("set-cookie");
      const headers: Record<string, string> = {};
      if (setCookie) {
        headers["set-cookie"] = setCookie;
      }
      return Response.json(data, { status: 200, headers });
    }

    // ส่งต่อ status/message จริงจาก PHP (เดิมบังคับ 401 ทุกกรณี
    // ทำให้ backend 500/400/ล่ม โชว์เป็น Unauthorized ใน console จน debug ไม่ออก)
    const status = res.status >= 400 && res.status <= 599 ? res.status : 502;
    return Response.json(
      {
        success: false,
        error:
          data.error ||
          (status >= 500
            ? "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง"
            : "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"),
        code: data.code || (status >= 500 ? "INTERNAL_ERROR" : "LOGIN_FAILED"),
      },
      { status }
    );
  } catch {
    return Response.json(
      { success: false, error: "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง", code: "NETWORK_ERROR" },
      { status: 502 }
    );
  }
}
