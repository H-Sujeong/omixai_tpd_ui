"""Tiny email sender (stdlib smtplib). If SMTP isn't configured, the message is
logged instead of sent — so password reset still works in dev (the admin reads
the link from the server log)."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from .config import get_settings

log = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> bool:
    """Send a plain-text email. Returns True if actually sent over SMTP, False if
    SMTP is unconfigured (in which case the body is logged)."""
    s = get_settings()
    if not s.smtp_host:
        log.warning("SMTP not configured — email to %s NOT sent. Body:\n%s", to, body)
        return False
    msg = EmailMessage()
    msg["From"] = s.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as srv:
            if s.smtp_tls:
                srv.starttls()
            if s.smtp_user:
                srv.login(s.smtp_user, s.smtp_password)
            srv.send_message(msg)
        log.info("sent email to %s", to)
        return True
    except Exception as exc:  # noqa: BLE001
        log.error("failed to send email to %s: %s", to, exc)
        return False
