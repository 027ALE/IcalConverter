function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export default async (req, context) => {
  if (req.method !== "GET") {
    return jsonResponse({ error: "Metodo non supportato." }, 405);
  }

  if (!context?.clientContext?.user) {
    return jsonResponse({ error: "Autenticazione richiesta." }, 401);
  }

  return jsonResponse({
    ok: true,
    user: {
      email: context.clientContext.user.email,
      id: context.clientContext.user.id,
    },
  });
};

export const config = {
  path: "/api/auth",
};
