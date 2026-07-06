#!/usr/bin/env python3
"""
Completa un invito o un recupero password di Netlify Identity chiamando
direttamente l'API (stesso endpoint che userebbe il widget nel browser),
bypassando completamente il browser: utile per escludere che il problema
sia un'estensione/ad-blocker che interferisce col widget.

ATTENZIONE: questo tenta di usare il token per davvero. Se ha successo,
la password che indichi diventa quella definitiva dell'account. Se il
token era gia' scaduto/consumato, questa chiamata lo confermera' con
l'errore esatto restituito dal server (non "spreca" nulla che non fosse
gia' rotto: un token valido invece verra' correttamente completato).

Uso:
    python3 identity_complete_invite.py <url-sito> <tipo> <token> <password>

    <tipo> e' 'invite' oppure 'recovery' (si ricava dal nome del
    parametro nell'URL: invite_token -> invite, recovery_token -> recovery)

Esempio, per un link tipo:
    https://eclectic-muffin-7b1f9a.netlify.app/#recovery_token=XgDEGbt7tyhdjfeKQwifCg

    python3 identity_complete_invite.py \\
        https://eclectic-muffin-7b1f9a.netlify.app \\
        recovery \\
        XgDEGbt7tyhdjfeKQwifCg \\
        "UnaPasswordNuovaSicura123"
"""

import sys
import ssl
import json
import urllib.request
import urllib.error
from urllib.parse import urlsplit, urlunsplit


def normalize_origin(raw_url: str) -> str:
    parts = urlsplit(raw_url)
    if not parts.scheme or not parts.netloc:
        raise ValueError(f"URL non valido: {raw_url!r}")
    return urlunsplit((parts.scheme, parts.netloc, "", "", ""))


def build_ssl_context() -> ssl.SSLContext:
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def complete(raw_url: str, token_type: str, token: str, password: str) -> None:
    if token_type not in ("invite", "recovery", "signup", "email_change"):
        print(f"Tipo non riconosciuto: {token_type!r} (atteso: invite/recovery/signup/email_change)")
        return

    origin = normalize_origin(raw_url)
    url = origin + "/.netlify/identity/verify"
    payload = json.dumps({"type": token_type, "token": token, "password": password}).encode("utf-8")

    print(f"POST {url}")
    print(f"Body: {{'type': '{token_type}', 'token': '{token[:6]}...{token[-6:]}', 'password': '***'}}\n")

    ctx = build_ssl_context()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            status = resp.status
            body = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        status = e.code
        body = e.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as e:
        reason = str(e.reason)
        print(f"Errore di rete: {reason}")
        if "CERTIFICATE_VERIFY_FAILED" in reason:
            print(
                "\nProblema certificati locale (non del sito). Risolvi con:\n"
                "  pip3 install certifi\n"
                "oppure eseguendo 'Install Certificates.command' nella cartella "
                "Python del Launchpad/Applicazioni."
            )
        return

    print(f"HTTP status: {status}\n")
    try:
        data = json.loads(body)
        print(json.dumps(data, indent=2, ensure_ascii=False))
    except json.JSONDecodeError:
        print("Corpo grezzo (non JSON):")
        print(body[:1000])
        data = None

    print()
    if status == 200 and data and data.get("token"):
        print(
            "RISULTATO: account completato con successo. La password indicata "
            "e' ora quella attiva: puoi tornare al sito e accedere normalmente "
            "con questa email e password. Il problema era quindi nel "
            "browser/widget, non nel token ne' nella configurazione Netlify."
        )
    else:
        msg = (data or {}).get("msg") or (data or {}).get("error_description") or ""
        print(f"RISULTATO: non completato. Messaggio del server: {msg or '(vedi corpo sopra)'}")
        print(
            "Se il messaggio parla di token scaduto/non valido/gia' usato, "
            "serve generare un invito o un reset NUOVO e testarlo subito con "
            "questo stesso script, senza aprirlo prima nel browser o nella mail."
        )


if __name__ == "__main__":
    if len(sys.argv) != 5:
        print(__doc__)
        sys.exit(1)

    _, site_url, token_type, token, password = sys.argv
    complete(site_url, token_type, token, password)